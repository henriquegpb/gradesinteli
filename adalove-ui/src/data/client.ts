import type { ActivityStatus, RawUserdata } from "~/data/types";

// O content script roda no mundo ISOLADO, mas na ORIGEM do Adalove — então lê
// o localStorage da página direto. O token nunca sai do navegador: não vai para
// chrome.storage, não vai para servidor nenhum. Mesma postura da extensão atual.

const API_BASE = "https://apiv2.inteli.edu.br";

const TOKEN_KEY = "@buzz:token";
const MFA_KEY = "@buzz:token-mfa";
const SECTION_KEY = "@buzz:currentSection";

/** Valores do Adalove vêm JSON-stringificados às vezes, crus outras. */
function readLocal(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object") return null;
    } catch {
      /* não era JSON: usa cru */
    }
    return raw;
  } catch {
    return null;
  }
}

function readLocalObject(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export class AdaloveAuthError extends Error {}

/** Réplica do `getAvatarSrc` do Adalove: o nome do arquivo vira URL no bucket
 *  deles, e sem arquivo eles chutam `{uuid}.jpg`. Sem o cache-buster `?t=` do
 *  original — aqui só lemos, e ele impediria o navegador de cachear. */
const S3_URL = "https://buzz-prod.s3.us-east-1.amazonaws.com/";

export function avatarUrl(filename: string | null, uuid: string | null): string | null {
  const name = filename?.trim();
  if (name) {
    if (/^https?:\/\//.test(name)) return name;
    return `${S3_URL}${name.startsWith("users/") ? name : `users/avatar/${name}`}`;
  }
  return uuid ? `${S3_URL}users/avatar/${uuid}.jpg` : null;
}

export interface AdaloveUser {
  name: string | null;
  email: string | null;
  uuid: string | null;
  avatar: string | null;
}

/** O Adalove guarda o usuário logado em `@buzz:user` (JSON) e a foto em
 *  `@buzz:avatar`. Os nomes exatos dos campos não dão para confirmar no bundle
 *  minificado, então aceitamos as grafias plausíveis e devolvemos null no que
 *  não reconhecer — melhor um campo vazio que um card errado. */
export function currentUser(): AdaloveUser | null {
  const raw = readLocalObject("@buzz:user");
  const avatar = readLocal("@buzz:avatar");
  if (!raw && !avatar) return null;

  const pick = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = raw?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  const first = pick(["first_name", "firstName"]);
  const last = pick(["last_name", "lastName"]);
  const uuid = pick(["uuid", "user_uuid", "id"]);

  return {
    name: pick(["name", "full_name", "fullName"]) ?? ([first, last].filter(Boolean).join(" ") || null),
    email: pick(["email", "mail", "login"]),
    uuid,
    // `@buzz:avatar` já guarda a URL pronta; do `@buzz:user` vem só o arquivo.
    avatar:
      avatar && /^https?:\/\//.test(avatar)
        ? avatar
        : avatarUrl(pick(["avatar_filename", "avatar", "avatar_url"]), uuid),
  };
}

export function getToken(): string | null {
  return readLocal(TOKEN_KEY);
}

/** Uma frase só para a sessão vencida, em todo lugar: é a mesma situação e o
 *  mesmo remédio, e o aluno não precisa decorar dois textos para o mesmo
 *  problema. Recarregar basta porque o Adalove renova a sessão no carregamento
 *  — só quando o refresh também venceu é que a tela de entrada aparece. */
export const SESSION_EXPIRED_MESSAGE =
  "Sua sessão do Adalove expirou. Recarregue a página para continuar.";

/** Quando o token expira, em ms de epoch, lido do claim `exp` do próprio JWT —
 *  sem rede. `null` quando não há token ou o formato não é o esperado: aí não
 *  dá para afirmar nada, e quem chama segue pelo caminho normal. */
export function tokenExpiresAt(): number | null {
  const payload = getToken()?.split(".")[1];
  if (!payload) return null;

  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const exp = (
      JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as { exp?: unknown }
    ).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Sessão vencida, ou a ponto de vencer.
 *
 *  A folga cobre o tempo de voo: um token que expira em dois segundos chega
 *  expirado do outro lado, e o erro que volta daí é pior de ler do que o aviso
 *  que damos antes de pedir. */
export function sessionExpired(skewMs = 5_000): boolean {
  const at = tokenExpiresAt();
  return at !== null && Date.now() + skewMs >= at;
}

// ---- renovação -------------------------------------------------------------
//
// O access token do Cognito vive uma hora. Quem deixa a aba aberta passa desse
// prazo todo dia — e a sessão NÃO acabou: o refresh token, que dura semanas,
// está ali do lado, e é com ele que o app do Adalove se renova sozinho. Antes
// daqui a gente só sabia detectar o vencimento e pedir para recarregar, o que
// transformava uma renovação de meio segundo num aviso permanente na tela.
//
// A renovação em si mora em `~/data/auth` (é conversa com o Cognito). Ela chega
// aqui injetada para não fazer client ↔ auth se importarem em círculo.

type Refresher = () => Promise<"ok" | "rejected" | "offline">;

let refresher: Refresher | null = null;

/** Liga a renovação. Sem isto (harness de dev) o comportamento é o de antes:
 *  detecta o vencimento, não renova. */
export function setTokenRefresher(fn: Refresher | null) {
  refresher = fn;
}

/** Margem para renovar ANTES de vencer. Um minuto e meio cobre a leitura de uma
 *  tela inteira: o token troca no intervalo da sondagem, sem nenhuma chamada
 *  chegar a falhar. */
const RENEW_SKEW_MS = 90_000;

/** `unknown` é o caso "não deu para saber" (rede fora): quem chama mantém o que
 *  já mostrava em vez de anunciar uma morte que não confirmou. */
export type SessionState = "ok" | "expired" | "unknown";

/** Renovação em voo. Sem isto, a sondagem e uma chamada que caem no mesmo
 *  instante disparariam dois POSTs para o Cognito — e o segundo gravaria por
 *  cima do primeiro. */
let renewing: Promise<SessionState> | null = null;

/** Devolve uma sessão utilizável, renovando se for a hora.
 *
 *  Só faz rede quando o token está perto de vencer; no resto do tempo é uma
 *  leitura de localStorage e uma conta de data. */
export async function ensureSession(): Promise<SessionState> {
  if (!getToken()) return "expired";
  if (!sessionExpired(RENEW_SKEW_MS)) return "ok";
  if (!refresher) return sessionExpired() ? "expired" : "ok";

  renewing ??= refresher()
    .then((outcome): SessionState =>
      outcome === "ok" ? "ok" : outcome === "offline" ? "unknown" : "expired",
    )
    .finally(() => {
      renewing = null;
    });

  return renewing;
}

/** A API do Adalove não é consistente com sessão velha: `/status` de uma
 *  atividade responde **400**, não 401 — deixar um card parado numa aba aberta
 *  e tentar movê-lo era exatamente isso, e o aluno lia "Adalove respondeu 400"
 *  sem ter como saber que bastava recarregar. Quando o corpo fala de token, o
 *  código de status não é a melhor fonte. */
const AUTH_HINT = /token|jwt|unauthor|expir|credential|not authenticated|sess(ao|ão|ion)/i;

function looksLikeAuthFailure(status: number, body: string): boolean {
  return (status === 400 || status === 422) && AUTH_HINT.test(body);
}

/** O que o logout do Adalove NÃO apaga. A lista é literalmente a deles (o
 *  `logout` do bundle guarda estes valores, chama `localStorage.clear()` e os
 *  devolve): preferência de menu, idioma, tour, tema e — o que mais importa
 *  aqui — a turma corrente, que é o que a Vida Acadêmica abre no próximo login.
 *  Zerar essas chaves faria "Sair" apagar mais coisa que o botão original. */
const KEEP_ON_LOGOUT = new Set([
  "@buzz:menu",
  "@buzz:menu-orientation",
  "@buzz:version",
  "@buzz:tour",
  "@buzz:uh",
  "@buzz:currentSection",
  "@buzz:currentSectionMBA",
  "@buzz:sso",
  "@buzz:bootcamp_type",
  "@buzz:source",
  "i18nextLng",
  "mode",
]);

/** Apaga a sessão do Adalove: token, MFA, usuário, avatar e o cache de tokens do
 *  Cognito (`CognitoIdentityServiceProvider.*`), que é onde mora a credencial de
 *  verdade — sem tirar esse cache, a UI original se reautenticaria sozinha e
 *  "Sair" não teria saído de nada.
 *
 *  Quem chama recarrega em seguida: sem token a overlay não monta (mount.tsx
 *  checa antes) e a tela de login aparece. */
export function clearSession() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (KEEP_ON_LOGOUT.has(key)) continue;
      if (key.startsWith("@buzz:") || key.startsWith("CognitoIdentityServiceProvider.")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage bloqueado: o recarregamento ainda leva para o login */
  }
}

/** O Adalove guarda a turma ora como uuid cru, ora como objeto. Aceita os dois. */
export function currentSectionUuid(): string | null {
  const direct = readLocal(SECTION_KEY);
  if (direct) return direct;

  const obj = readLocalObject(SECTION_KEY);
  if (!obj) return null;
  for (const key of ["sectionUuid", "uuid", "id", "value"]) {
    const v = obj[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/** Turma a carregar. Normalmente é a que o Adalove guardou; num primeiro acesso
 *  (ou depois de um login feito pela nossa tela, num navegador que nunca abriu a
 *  Vida Acadêmica) essa chave não existe ainda, e aí a lista de turmas responde:
 *  a aberta é a corrente, e a mais recente serve de desempate. */
export async function resolveSectionUuid(): Promise<string | null> {
  const stored = currentSectionUuid();
  if (stored) return stored;

  try {
    const rows = await adaloveGet<{ uuid: string; status?: string; date?: string }[]>("/sections");
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const open = rows.find((s) => (s.status ?? "").toLowerCase() === "open");
    const newest = [...rows].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
    return open?.uuid ?? newest?.uuid ?? null;
  } catch {
    return null;
  }
}

async function adaloveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!getToken()) {
    throw new AdaloveAuthError("Sessão do Adalove não encontrada. Faça login novamente.");
  }

  // Antes de pedir: numa aba esquecida aberta o token já venceu, e o que volta
  // da API nesse caso vai de 401 a 400 dependendo do endpoint. Só que vencido
  // não quer dizer acabado — primeiro tentamos renovar, e só desistimos quando
  // o Cognito também recusa.
  if ((await ensureSession()) === "expired") {
    throw new AdaloveAuthError(SESSION_EXPIRED_MESSAGE);
  }

  // Depois do `ensureSession`: se houve renovação, o token daqui é o novo.
  const token = getToken();
  if (!token) {
    throw new AdaloveAuthError("Sessão do Adalove não encontrada. Faça login novamente.");
  }

  const mfa = readLocal(MFA_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(mfa ? { "X-MFA-Token": `Bearer ${mfa}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new AdaloveAuthError(SESSION_EXPIRED_MESSAGE);
  }
  if (!res.ok) {
    // O corpo do erro é lido antes de desistir: é ele que separa uma sessão
    // velha de uma recusa de verdade quando o status é 400.
    const detail = await res.text().catch(() => "");
    if (looksLikeAuthFailure(res.status, detail)) {
      throw new AdaloveAuthError(SESSION_EXPIRED_MESSAGE);
    }
    throw new Error(`Adalove respondeu ${res.status} em ${path}`);
  }

  // As escritas do Adalove respondem sem corpo: `PUT /notifications` devolve 204
  // e `POST /sections/{uuid}/absences-limit` devolve 200 com corpo vazio. Um
  // `res.json()` direto lança SyntaxError aí — e quem chamou leria isso como
  // falha da escrita, mesmo com o servidor já tendo aceitado (era o que fazia o
  // "marcar todas como lidas" mostrar erro e desmarcar o sino de volta).
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text ? (JSON.parse(text) as T) : (null as T));
}

/** GET genérico para as telas novas. */
export function adaloveGet<T>(path: string): Promise<T> {
  return adaloveFetch<T>(path);
}

/** PUT genérico para as telas novas (marcar notificações como lidas, etc.). */
export function adalovePut(path: string, body?: unknown): Promise<unknown> {
  return adaloveFetch(path, {
    method: "PUT",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** POST genérico (pedido de revisão de nota, criar tarefa). */
export function adalovePost(path: string, body?: unknown): Promise<unknown> {
  return adaloveFetch(path, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** DELETE genérico (apagar tarefa). */
export function adaloveDelete(path: string): Promise<unknown> {
  return adaloveFetch(path, { method: "DELETE" });
}

export function fetchUserdata(sectionUuid: string): Promise<RawUserdata> {
  return adaloveFetch<RawUserdata>(`/sections/${sectionUuid}/userdata`);
}

/** Notícias do Adalove. Formato da resposta normalizado em data/news.ts. */
export function fetchNews(limit = 4): Promise<unknown> {
  return adaloveFetch<unknown>(`/posts?limit=${limit}`);
}

/** Baixa o PDF do boleto. O Adalove faz `GET {endpoint}/{bankSlipId}`, monta um
 *  Blob e dispara um `<a download>` — replicado aqui.
 *
 *  A resposta pode vir como PDF binário ou como Buffer serializado em JSON
 *  (`{type:"Buffer",data:[...]}`); tratamos os dois, senão o arquivo salvo
 *  seria o JSON com extensão .pdf. */
export async function downloadBankSlip(bankSlipId: string | number, filename: string) {
  const token = getToken();
  if (!token) throw new AdaloveAuthError("Sessão do Adalove não encontrada.");

  const res = await fetch(`${API_BASE}/students/btgpactual/bank-slips/${bankSlipId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Adalove respondeu ${res.status} ao baixar o boleto.`);

  const type = res.headers.get("content-type") ?? "";
  let blob: Blob;
  if (type.includes("json")) {
    const payload = (await res.json()) as { data?: number[] } | number[];
    const bytes = Array.isArray(payload) ? payload : (payload.data ?? []);
    blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  } else {
    blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Arrastar um card — o mesmo write que a UI original dispara. */
export function putActivityStatus(
  studentActivityUuid: string,
  status: ActivityStatus,
  sort: number,
): Promise<unknown> {
  return adaloveFetch(`/student-activities/${studentActivityUuid}/status`, {
    method: "PUT",
    body: JSON.stringify({ sort, status: String(status) }),
  });
}

/** Limite do Adalove para a resposta, do bundle deles: acima disso a API recusa
 *  e o front avisa "Sua resposta ultrapassou o limite de 8000 caracteres". */
export const ANSWER_MAX_CHARS = 8000;

/** Campos do cartão que a UI original escreve pelo autosave.
 *
 *  Os nomes de ESCRITA não são os de leitura do /userdata: a resposta se chama
 *  `activityStudyAnswer` aqui e `studyAnswer` lá, e a API responde 400 com o
 *  nome de leitura. Saiu do bundle deles
 *  (`Y({target:{value, name:"activityStudyAnswer"}})`); os demais campos do
 *  mesmo endpoint seguem o prefixo `activity*`, que é o que faz `activityNotes`
 *  e `activityTags` valerem para os dois lados. */
export interface ActivityFields {
  activityStudyAnswer?: string;
  activityNotes?: string;
  /** Tags numa string só, separadas por vírgula. */
  activityTags?: string;
}

/** `PUT /student-activities/{uuid}/autosave  { campo: valor }` — um mapa, não um
 *  campo fixo: é o mesmo endpoint para resposta, anotações e tags. */
export function putActivityFields(
  studentActivityUuid: string,
  fields: ActivityFields,
): Promise<unknown> {
  return adaloveFetch(`/student-activities/${studentActivityUuid}/autosave`, {
    method: "PUT",
    body: JSON.stringify(fields),
  });
}
