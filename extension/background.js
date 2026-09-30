// background.js — service worker (Chrome) / event page (Firefox).
//
// Existe por um motivo só: buscar a "Ficha do aluno", um Apps Script do domínio
// da Inteli que exige o login Google do aluno. O content script do Adalove não
// consegue: a resposta não tem CORS, e o cookie do Google é de outro site. Daqui,
// com host permission para script.google.com, o fetch leva a sessão Google que o
// navegador já tem — o mesmo que abrir o link numa aba.
//
// Nada sai do navegador: a página pede, este worker busca, a página recebe.

const FICHA_URL =
  "https://script.google.com/a/macros/sou.inteli.edu.br/s/AKfycbzPPAq9NHqyqsl_MqaA1m1RkZ4H1uuFH58JsDLpoYqL6EGhHRPQFsqbT5fJhbM9pE1L/exec";

const api = globalThis.browser ?? globalThis.chrome;

// Permissão OPCIONAL (optional_host_permissions): pedir no install desativaria
// a extensão de quem já a tem até aceitar, e ninguém saberia por quê. Ela é
// pedida pela própria tela de Métricas avançadas, no clique — ver authorize.html.
const FICHA_ORIGINS = ["https://script.google.com/*"];

/** Decodifica o CONTEÚDO de um literal de string JS (sem as aspas). O Google
 *  escapa tudo como `\x7b`, `\x22`, `\/`… e `eval` não é opção num worker MV3. */
function unescapeJs(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = s[++i];
    if (n === "x") {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (n === "u") {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16));
      i += 4;
    } else if (n === "n") out += "\n";
    else if (n === "r") out += "\r";
    else if (n === "t") out += "\t";
    else out += n; // \\ \" \' \/
  }
  return out;
}

/** O objeto ou array que começa em `start` (um `{` ou `[`), recortado por
 *  contagem de chaves que respeita strings — o JSON pode ter `}` dentro de
 *  nomes de atividade. */
function sliceObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if ((c === "}" || c === "]") && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** O valor JSON (objeto ou array) atribuído a `window.<name>` no HTML do script. */
function readGlobal(userHtml, name) {
  const marker = userHtml.search(new RegExp(`window\\.${name}\\s*=\\s*[[{]`));
  if (marker < 0) return null;
  const start = userHtml.slice(marker).search(/[[{]/) + marker;
  const json = sliceObject(userHtml, start);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** A página do `exec` embrulha o HTML do script num `goog.script.init("…",
 *  "<token>", …)`. Dentro desse HTML o autor deixou `window.FICHA_INLINE` (a
 *  ficha da turma padrão, já pronta) e `window.FICHA_TURMAS` (o dropdown de
 *  trimestre: `{section_id, trimestre, turma}`). O token é o que o
 *  `google.script.run` manda no `callback` para pedir outra turma. */
function parsePage(page) {
  const init = page.match(/goog\.script\.init\("((?:[^"\\]|\\.)*)"\s*(?:,\s*"((?:[^"\\]|\\.)*)")?/);
  if (!init) return null;

  let userHtml;
  try {
    userHtml = JSON.parse(unescapeJs(init[1])).userHtml;
  } catch {
    return null;
  }
  if (typeof userHtml !== "string") return null;

  const turmas = readGlobal(userHtml, "FICHA_TURMAS");
  return {
    ficha: readGlobal(userHtml, "FICHA_INLINE"),
    turmas: Array.isArray(turmas) ? turmas : [],
    token: init[2] ? unescapeJs(init[2]) : null,
  };
}

function parseFicha(page) {
  return parsePage(page)?.ficha ?? null;
}

/** "2026-10-14 → 2026-12-18" → "2026-10-14". */
function inicioDoPeriodo(ficha) {
  return /^\s*(\d{4}-\d{2}-\d{2})/.exec(ficha?.meta?.periodo ?? "")?.[1] ?? null;
}

/** A ficha passa a abrir no módulo SEGUINTE antes dele começar — tudo `null`
 *  até a primeira aula. Nesse intervalo, o que o aluno quer ver é o módulo que
 *  ainda está rodando: a turma anterior do dropdown. */
function turmaAnterior(ficha, turmas, hoje) {
  const inicio = inicioDoPeriodo(ficha);
  if (!inicio || inicio <= hoje) return null;
  const atual = ficha.meta.section_id;
  const ordenadas = [...turmas].sort((a, b) => String(a.trimestre).localeCompare(String(b.trimestre)));
  const i = ordenadas.findIndex((t) => t.section_id === atual);
  return i > 0 ? ordenadas[i - 1] : null;
}

// O `callback` fica num caminho diferente do `exec` (`/a/<domínio>/macros/…`),
// é o que o google.script.run da própria ficha usa.
const CALLBACK_URL =
  "https://script.google.com/a/sou.inteli.edu.br/macros/s/AKfycbzPPAq9NHqyqsl_MqaA1m1RkZ4H1uuFH58JsDLpoYqL6EGhHRPQFsqbT5fJhbM9pE1L/callback";

let nocacheId = 0;

/** Resposta do `callback`: `)]}'` + `[["op.exec",[0,<valor>]],["di",…]]`. O
 *  valor pode vir como objeto ou como string JSON, conforme a versão do cliente. */
function parseCallback(text) {
  let entries;
  try {
    entries = JSON.parse(text.replace(/^\)\]\}'\s*/, ""));
  } catch {
    return null;
  }
  const exec = Array.isArray(entries) ? entries.find((e) => Array.isArray(e) && e[0] === "op.exec") : null;
  let value = exec?.[1]?.[1];
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" ? value : null;
}

/** O mesmo que `google.script.run.getFichaPayload(sectionId)` faz no dropdown. */
async function fetchFichaDaTurma(sectionId, token) {
  const body = new URLSearchParams({
    request: JSON.stringify(["getFichaPayload", JSON.stringify([sectionId]), null, [0], null, null, 1, 0]),
  });
  const url = `${CALLBACK_URL}?nocache_id=${++nocacheId}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "X-Same-Domain": "1" },
    body,
  });
  if (!res.ok) return null;
  return parseCallback(await res.text());
}

/** Data local, `YYYY-MM-DD` — mesma forma do `periodo` da ficha. */
function hojeLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Última página do `exec` lida: o token do `callback` e o dropdown. Vive só
 *  enquanto o worker vive; trocar de trimestre logo depois de abrir a tela não
 *  precisa buscar o `exec` de novo. */
let lastPage = null;
const PAGE_TTL_MS = 20 * 60 * 1000;

async function loadPage() {
  let res;
  try {
    // `manual`: com sessão, o exec responde 200 direto. Sem sessão, o Google
    // redireciona para accounts.google.com — onde não temos permissão, então
    // seguir o redirect viraria um erro de rede genérico em vez de "entre".
    res = await fetch(FICHA_URL, { credentials: "include", redirect: "manual" });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    // Nem todo redirect é falta de sessão (o Google às vezes ajusta a conta na
    // URL). Segue uma vez: se cair no login, o fetch quebra por falta de
    // permissão lá, e aí sim é "entre com o Google".
    try {
      res = await fetch(FICHA_URL, { credentials: "include", redirect: "follow" });
    } catch {
      return { ok: false, reason: "login" };
    }
    if (new URL(res.url).hostname === "accounts.google.com") return { ok: false, reason: "login" };
  }
  if (!res.ok) return { ok: false, reason: "http", status: res.status };

  const page = parsePage(await res.text());
  if (!page?.ficha) return { ok: false, reason: "format" };
  lastPage = { ...page, at: Date.now() };
  return { ok: true, page };
}

function reply(page, data) {
  return {
    ok: true,
    data: { ...data, turmas: page.turmas, turma_padrao: page.ficha.meta.section_id },
    url: FICHA_URL,
  };
}

/** Sem `sectionId`: a turma que a ficha abre, ou a anterior se o módulo dela
 *  ainda não começou (ver `turmaAnterior`). Com `sectionId`: essa turma, como
 *  o dropdown da ficha faz. */
async function fetchFicha(sectionId) {
  if (!(await api.permissions.contains({ origins: FICHA_ORIGINS }))) {
    return { ok: false, reason: "permission" };
  }

  if (sectionId != null) {
    const fresh = lastPage && Date.now() - lastPage.at < PAGE_TTL_MS;
    let page = fresh ? lastPage : null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!page) {
        const loaded = await loadPage();
        if (!loaded.ok) return loaded;
        page = loaded.page;
      }
      if (sectionId === page.ficha.meta.section_id) return reply(page, page.ficha);
      if (!page.token) return { ok: false, reason: "format" };
      const data = await fetchFichaDaTurma(sectionId, page.token).catch(() => null);
      if (data?.meta) return reply(page, data);
      page = null; // token vencido? busca o exec de novo e tenta mais uma vez
    }
    return { ok: false, reason: "http" };
  }

  const loaded = await loadPage();
  if (!loaded.ok) return loaded;
  const { page } = loaded;

  const anterior = page.token && turmaAnterior(page.ficha, page.turmas, hojeLocal());
  if (anterior) {
    // Falhar aqui não é erro: fica a ficha vazia do módulo seguinte, que é o
    // que o próprio site mostra.
    const data = await fetchFichaDaTurma(anterior.section_id, page.token).catch(() => null);
    if (data?.meta) return reply(page, data);
  }
  return reply(page, page.ficha);
}

/** Janela pequena com o botão que pede a permissão. Uma só: clicar de novo em
 *  "Autorizar" traz a mesma para a frente em vez de empilhar outra. */
let authWindowId = null;

async function openAuthorize() {
  if (authWindowId != null) {
    try {
      await api.windows.update(authWindowId, { focused: true });
      return;
    } catch {
      authWindowId = null; // já foi fechada
    }
  }
  const win = await api.windows.create({
    url: api.runtime.getURL("authorize.html"),
    type: "popup",
    width: 440,
    height: 460,
  });
  authWindowId = win?.id ?? null;
}

api?.windows?.onRemoved.addListener((id) => {
  if (id === authWindowId) authWindowId = null;
});

api?.runtime?.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "gi:ficha") {
    const sectionId = Number.isInteger(msg.sectionId) ? msg.sectionId : undefined;
    fetchFicha(sectionId).then(sendResponse, () => sendResponse({ ok: false, reason: "network" }));
    return true; // resposta assíncrona
  }
  if (msg?.type === "gi:ficha-authorize") {
    openAuthorize().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  return false;
});

// Exportado só para o teste em node; no navegador `module` não existe.
if (typeof module !== "undefined") module.exports = { parseFicha, parsePage, parseCallback, turmaAnterior, unescapeJs };
