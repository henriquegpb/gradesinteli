import { avatarUrl, clearSession } from "~/data/client";

// Login e logout direto no Cognito — é lá que o Adalove autentica de verdade.
//
// O app deles é Amplify, configurado (no bundle de produção) com
// `authenticationFlowType: "USER_PASSWORD_AUTH"`. Esse fluxo é UM POST: sem SRP,
// sem SDK. Por isso a tela de login nossa não precisa carregar 90 kB de
// biblioteca para fazer exatamente o que a deles faz.
//
// A senha vai do formulário para o `fetch` e morre ali: não é guardada em lugar
// nenhum, não passa por servidor nosso e o destino é o mesmo endpoint que a
// página do Adalove chama. O que fica no localStorage depois é a MESMA sessão
// que o login deles deixaria — inclusive o cache do Amplify, para que a UI
// original continue logada e o refresh de token siga funcionando.

const REGION = "us-east-2";
const CLIENT_ID = "6v6iqlcv6hl5p3u628geho1cjp";
const IDP_URL = `https://cognito-idp.${REGION}.amazonaws.com/`;
const CACHE_PREFIX = `CognitoIdentityServiceProvider.${CLIENT_ID}`;

const API_BASE = "https://apiv2.inteli.edu.br";

/** Endereço do login do próprio Adalove — o escape para tudo que a nossa tela
 *  não resolve (Google, MFA, primeiro acesso). Deslogado, a raiz É a tela de
 *  entrada deles: não existe `/login`. */
export const ADALOVE_LOGIN_URL = "/";
export const ADALOVE_FORGOT_URL = "/forgot-password";

/** A overlay ocupa a raiz quando não há sessão, então mandar alguém para o
 *  login do Adalove exige avisar que desta vez é para sair da frente — senão o
 *  clique voltaria para a nossa própria tela.
 *
 *  Em `sessionStorage`: vale para esta aba e some ao fechá-la. Quem precisou do
 *  Google uma vez não fica preso à tela deles para sempre. */
const BYPASS_KEY = "gi:adalove-login";

export function adaloveLoginPreferred(): boolean {
  try {
    return sessionStorage.getItem(BYPASS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Entra com o Google acionando o botão do PRÓPRIO Adalove.
 *
 *  O fluxo deles é o Hosted UI do Cognito com PKCE: antes de sair, o app guarda
 *  um verificador e um `state`, e confere os dois na volta (`/login-google`).
 *  Montar essa URL por fora significaria forjar esse par — e errar nele quebra o
 *  login sem dizer por quê, no caminho que TODO mundo usa.
 *
 *  Então, em vez de imitar, apertamos o botão original: a UI deles continua
 *  montada atrás da nossa (só escondida por CSS), e o clique faz o código deles
 *  preparar o estado certo e redirecionar. `#google-solido` é o id que o próprio
 *  botão carrega — não é classe gerada, então não muda a cada build deles.
 *
 *  Devolve `false` quando não achou o botão; aí quem chamou manda para a tela
 *  deles, que é o mesmo destino por um caminho mais longo. */
export function signInWithGoogle(): boolean {
  const button = document.querySelector("#google-solido")?.closest("button");
  if (!button) return false;
  button.click();
  return true;
}

/** Com sessão na mão o desvio já cumpriu o papel. Sem isto, quem entrou uma vez
 *  pelo Google veria a tela deles de novo no próximo "Sair" da mesma aba. */
export function forgetAdaloveLogin() {
  try {
    sessionStorage.removeItem(BYPASS_KEY);
  } catch {
    /* sem sessionStorage não havia desvio para esquecer */
  }
}

export function goToAdaloveLogin(url: string = ADALOVE_LOGIN_URL) {
  try {
    sessionStorage.setItem(BYPASS_KEY, "1");
  } catch {
    /* sem sessionStorage a tela deles ainda abre; só voltaria a nossa depois */
  }
  location.assign(url);
}

interface CognitoSession {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
}

interface InitiateAuthResponse {
  AuthenticationResult?: CognitoSession;
  ChallengeName?: string;
  __type?: string;
  message?: string;
}

/** Erro já traduzido para a tela. `useAdalove` marca o que só o login deles
 *  resolve — aí a tela oferece o caminho em vez de repetir o mesmo erro. */
export class LoginError extends Error {
  readonly useAdalove: boolean;

  constructor(message: string, useAdalove = false) {
    super(message);
    this.name = "LoginError";
    this.useAdalove = useAdalove;
  }
}

/** O Cognito devolve o motivo em `__type` e a explicação em inglês em `message`.
 *  Traduzimos os casos que um aluno realmente encontra e deixamos o resto cair
 *  no genérico com o texto original — melhor um inglês estranho do que esconder
 *  o motivo. */
function translate(type: string | undefined, message: string | undefined): LoginError {
  const kind = (type ?? "").split("#").pop();

  switch (kind) {
    case "NotAuthorizedException":
      // O mesmo erro cobre senha errada e conta desativada; só a segunda diz.
      return /disabled/i.test(message ?? "")
        ? new LoginError("Esta conta está desativada no Adalove.", true)
        : new LoginError("E-mail ou senha incorretos.");
    case "UserNotFoundException":
      return new LoginError("Não encontrei uma conta com esse e-mail.");
    case "PasswordResetRequiredException":
      return new LoginError("O Adalove pediu uma nova senha para esta conta.", true);
    case "UserNotConfirmedException":
      return new LoginError("Esta conta ainda não foi confirmada.", true);
    case "TooManyRequestsException":
    case "LimitExceededException":
      return new LoginError("Muitas tentativas seguidas. Espere um minuto e tente de novo.");
    default:
      return new LoginError(message ?? "Não consegui falar com o Adalove.", true);
  }
}

async function idp<T>(target: string, body: unknown): Promise<T> {
  const res = await fetch(IDP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as T & { __type?: string; message?: string };
  if (!res.ok) throw translate(data.__type, data.message);
  return data;
}

/** Grava a sessão no formato do `cacheTokens()` do amazon-cognito-identity-js.
 *  São essas chaves que a UI original lê para se considerar logada e para
 *  renovar o token quando ele vence — sem elas, entrar por aqui deixaria a
 *  metade deles do app achando que ninguém entrou. */
function cacheSession(username: string, session: CognitoSession) {
  const write = (key: string, value: string | undefined) => {
    if (value) localStorage.setItem(key, value);
  };

  write("@buzz:token", session.AccessToken);
  write(`${CACHE_PREFIX}.LastAuthUser`, username);
  write(`${CACHE_PREFIX}.${username}.accessToken`, session.AccessToken);
  write(`${CACHE_PREFIX}.${username}.idToken`, session.IdToken);
  write(`${CACHE_PREFIX}.${username}.refreshToken`, session.RefreshToken);
  localStorage.setItem(`${CACHE_PREFIX}.${username}.clockDrift`, "0");
}

function lastAuthUser(): string | null {
  try {
    return localStorage.getItem(`${CACHE_PREFIX}.LastAuthUser`);
  } catch {
    return null;
  }
}

function cachedRefreshToken(): string | null {
  try {
    const username = lastAuthUser();
    return username ? localStorage.getItem(`${CACHE_PREFIX}.${username}.refreshToken`) : null;
  } catch {
    return null;
  }
}

/** `offline` é diferente de `rejected` de propósito: sem rede não dá para
 *  afirmar que a sessão morreu, e avisar "expirou" nesse caso seria mentir para
 *  quem só entrou no elevador. */
export type RefreshOutcome = "ok" | "rejected" | "offline";

/** Renova a sessão com o refresh token que o Amplify deles já guarda.
 *
 *  É o MESMO movimento que o app do Adalove faz sozinho quando o access token
 *  vence — por isso a sessão parece durar o dia inteiro na UI original. Só que
 *  o refresh deles roda a partir das chamadas deles, e com a nossa overlay na
 *  frente essas chamadas não acontecem: o token vencia, e a única coisa que a
 *  gente sabia fazer era pedir para recarregar. Aqui a gente renova em vez de
 *  avisar — o access token do Cognito dura uma hora, o refresh dura semanas.
 *
 *  O token novo é gravado nas mesmas chaves do cache do Amplify, então a UI
 *  original continua logada junto. O refresh token não volta na resposta e não
 *  é tocado: `cacheSession` só escreve o que veio. */
export async function refreshSession(): Promise<RefreshOutcome> {
  const username = lastAuthUser();
  const refresh = cachedRefreshToken();
  if (!username || !refresh) return "rejected";

  // `deviceKey` só existe se o pool deles tiver rastreio de dispositivo ligado —
  // e aí o refresh SEM ele é recusado. Vai junto quando o Amplify tiver gravado,
  // que é a mesma condição em que o refresh deles o manda.
  let deviceKey: string | null = null;
  try {
    deviceKey = localStorage.getItem(`${CACHE_PREFIX}.${username}.deviceKey`);
  } catch {
    /* storage bloqueado: tenta sem */
  }

  try {
    const res = await idp<InitiateAuthResponse>("InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refresh,
        ...(deviceKey ? { DEVICE_KEY: deviceKey } : {}),
      },
    });

    const session = res.AuthenticationResult;
    if (!session?.AccessToken) return "rejected";

    cacheSession(username, session);
    return "ok";
  } catch (error) {
    // `idp` só traduz para LoginError o que o Cognito RESPONDEU; qualquer outra
    // coisa (TypeError do fetch) é rede, não sessão.
    return error instanceof LoginError ? "rejected" : "offline";
  }
}

interface UserDetails {
  uuid?: string;
  name?: string;
  email?: string;
  cpf?: string | null;
  cnpj?: string | null;
  groups?: string;
  user_type?: string;
  params?: unknown;
  avatar_filename?: string | null;
  address?: Record<string, unknown> | null;
  course?: Record<string, unknown> | null;
}

/** Depois do token, o Adalove busca `/users/details` e guarda um recorte dele em
 *  `@buzz:user` (mais a foto em `@buzz:avatar`). Repetimos o mesmo recorte, com
 *  as mesmas chaves: é de lá que as duas UIs leem o nome do aluno.
 *
 *  A checagem de `groups` também é deles: conta sem grupo não tem acesso ao
 *  Adalove, e deixar o token gravado nesse caso daria uma sessão que falha em
 *  toda tela. */
async function loadProfile(token: string) {
  const res = await fetch(`${API_BASE}/users/details`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new LoginError(`O Adalove recusou a sessão (${res.status}).`, true);
  }

  const d = (await res.json()) as UserDetails;
  if (!d?.groups) {
    clearSession();
    throw new LoginError("Esta conta não tem acesso ao Adalove.", true);
  }

  const address = (d.address ?? {}) as Record<string, unknown>;
  const course = (d.course ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");

  localStorage.setItem(
    "@buzz:user",
    JSON.stringify({
      address: {
        address: text(address.address),
        address2: text(address.address2),
        address_number: address.address_number ?? 0,
        city: text(address.city),
        district: text(address.district),
        postal_code: text(address.postal_code),
        state: text(address.state),
      },
      course: {
        name: text(course.name),
        ra: text(course.ra),
        start_date: text(course.start_date),
      },
      email: d.email,
      name: d.name,
      cpf: d.cpf || null,
      cnpj: d.cnpj || null,
      uuid: d.uuid,
      user_type: d.user_type ?? "individual",
      groups: d.groups,
      params: d.params ?? "",
    }),
  );

  const avatar = avatarUrl(d.avatar_filename ?? null, d.uuid ?? null);
  if (avatar) localStorage.setItem("@buzz:avatar", avatar);
}

/** Entra com e-mail e senha. Ao voltar, a sessão está gravada e quem chamou pode
 *  recarregar no Adalove como se o login tivesse sido feito por lá. */
export async function signIn(email: string, password: string): Promise<void> {
  const username = email.trim();

  const res = await idp<InitiateAuthResponse>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });

  // Segundo fator, troca de senha obrigatória, primeiro acesso: são telas
  // inteiras que o Adalove já tem. Não vale reconstruir cada uma para o caso
  // raro — melhor mandar para lá do que travar a pessoa aqui.
  if (res.ChallengeName) {
    throw new LoginError(
      `Sua conta pede uma etapa extra de verificação (${res.ChallengeName}).`,
      true,
    );
  }

  const session = res.AuthenticationResult;
  if (!session?.AccessToken) {
    throw new LoginError("O Adalove não devolveu uma sessão válida.", true);
  }

  cacheSession(username, session);
  await loadProfile(session.AccessToken);
}

/** Sai de verdade: além de limpar o navegador, invalida o refresh token no
 *  Cognito — é o que o `Auth.signOut()` do app deles faz. Sem isso, "sair"
 *  seria só esquecer localmente uma credencial que continua válida.
 *
 *  A revogação é best-effort: se a rede falhar, a sessão local já foi embora e
 *  a pessoa está deslogada de qualquer jeito. */
export async function signOut(): Promise<void> {
  const refresh = cachedRefreshToken();
  clearSession();
  if (!refresh) return;

  try {
    await idp("RevokeToken", { Token: refresh, ClientId: CLIENT_ID });
  } catch {
    /* já saiu localmente */
  }
}
