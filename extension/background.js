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

/** O objeto que começa em `start` (um `{`), recortado por contagem de chaves
 *  que respeita strings — o JSON pode ter `}` dentro de nomes de atividade. */
function sliceObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** A página do `exec` embrulha o HTML do script num `goog.script.init("…")`, e
 *  é dentro desse HTML que o autor deixou `window.FICHA_INLINE = {…}` — os
 *  dados já prontos, sem precisar rodar o JS dele. */
function parseFicha(page) {
  const init = page.match(/goog\.script\.init\("((?:[^"\\]|\\.)*)"/);
  if (!init) return null;

  let userHtml;
  try {
    userHtml = JSON.parse(unescapeJs(init[1])).userHtml;
  } catch {
    return null;
  }
  if (typeof userHtml !== "string") return null;

  const marker = userHtml.search(/window\.FICHA_INLINE\s*=\s*\{/);
  if (marker < 0) return null;
  const json = sliceObject(userHtml, userHtml.indexOf("{", marker));
  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function fetchFicha() {
  if (!(await api.permissions.contains({ origins: FICHA_ORIGINS }))) {
    return { ok: false, reason: "permission" };
  }

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

  const data = parseFicha(await res.text());
  return data ? { ok: true, data, url: FICHA_URL } : { ok: false, reason: "format" };
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
    fetchFicha().then(sendResponse, () => sendResponse({ ok: false, reason: "network" }));
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
if (typeof module !== "undefined") module.exports = { parseFicha, unescapeJs };
