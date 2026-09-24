// Mapa rota nossa ↔ URL do Adalove.
//
// Os caminhos vêm do `GET /users/menus` do próprio Adalove (capturado em
// `data/adalove-capturas-*.json`), que é o menu que o front deles monta. Usar as
// MESMAS URLs é o que faz a overlay se comportar como página de verdade:
// endereço compartilhável, F5 abre a mesma tela, voltar/avançar funcionam, e
// quem sai para a UI original cai na página equivalente do Adalove.
//
// Duas telas nossas não existem lá (o kanban e o grupo moram dentro da Vida
// Acadêmica): essas ganham um sub-caminho de `/academic-life`, que continua
// dentro do território da overlay. Ao sair para a UI original, `canonicalPath`
// devolve o caminho real do Adalove para esse endereço sintético.
import type { RouteId } from "~/shell/nav";

export const ROUTE_PATHS: Record<RouteId, string> = {
  overview: "/academic-life",
  // Sintéticos: sub-telas da Vida Acadêmica, sem equivalente no Adalove.
  atividades: "/academic-life/atividades",
  grupo: "/academic-life/grupo",
  "prova-final": "/academic-life/prova-final",

  // Onde o Adalove larga quem abriu um endereço que ele não conhece. É rota
  // nossa para que o link quebrado não jogue a pessoa no 404 deles no meio da
  // navegação — a overlay mostra o próprio.
  "nao-encontrada": "/not-found",

  perfil: "/profile",
  noticias: "/feed",
  financeiro: "/financial",
  cardapio: "/menu",
  historico: "/student-record",
  carreiras: "/careers",
  intercambio: "/exchange-program/partners",
  simulados: "/mock-tests",
  atendimento: "/service-channels",
  "pagina:calendar": "/pages/calendar",
  "pagina:library": "/pages/library",
  "pagina:institutional-norms": "/pages/institutional-norms",
  "pagina:tools": "/pages/tools",
};

/** Outros endereços do Adalove que caem numa tela nossa. `/` é onde o Adalove
 *  larga o aluno depois do login; `notices` é a segunda aba do Intercâmbio, que
 *  reconstruímos numa tela só. */
const ALIASES: Record<string, RouteId> = {
  "/": "overview",
  "/exchange-program": "intercambio",
  "/exchange-program/notices": "intercambio",
};

/** Onde a UI original tem que aparecer para um endereço sintético nosso. */
const SYNTHETIC_FALLBACK = "/academic-life";

function normalize(pathname: string): string {
  // Uma barra no fim é o mesmo endereço; sem normalizar, `/feed/` não casaria.
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function pathForRoute(route: RouteId): string {
  return ROUTE_PATHS[route] ?? SYNTHETIC_FALLBACK;
}

/** Rota da tela que responde por este endereço, ou `null` se o Adalove é que
 *  responde por ele (checkin, notificações, surveys…) — aí a overlay sai. */
export function routeForPath(pathname = location.pathname): RouteId | null {
  const path = normalize(pathname);

  for (const [id, routePath] of Object.entries(ROUTE_PATHS) as [RouteId, string][]) {
    if (path === routePath) return id;
  }

  const alias = ALIASES[path];
  if (alias) return alias;

  // Qualquer outro sub-caminho da Vida Acadêmica é nosso: cai na Visão geral em
  // vez de devolver a tela do Adalove no meio da navegação.
  if (path.startsWith(`${SYNTHETIC_FALLBACK}/`)) return "overview";

  return null;
}

export function isOverlayPath(pathname = location.pathname): boolean {
  return routeForPath(pathname) !== null;
}

/** Onde o `adalove-boot.js` deixa o caminho sintético que o navegador pediu.
 *  Duplicada lá como string literal: aquele arquivo roda em document_start, sem
 *  bundler e antes de qualquer import. */
const BOOT_PATH_KEY = "gi:boot-path";

/** Devolve à barra de endereço o caminho sintético que o carregamento pediu.
 *
 *  Os sintéticos (`/academic-life/atividades`, `/academic-life/grupo`) não
 *  existem para o Adalove, e o `adalove-boot.js` os troca pelo caminho real em
 *  document_start justamente para o react-router deles não desviar para
 *  `/not-found` — o que fazia um F5 no kanban abrir a overlay no 404.
 *
 *  Aqui, já em document_idle, o endereço volta ao que era. `replaceState` não
 *  acorda o router do Adalove, então nada é redesenhado do lado deles.
 *
 *  Uma vez por carregamento: a chave é consumida na leitura. */
export function restoreSyntheticPath(): void {
  let requested: string | null = null;
  try {
    requested = sessionStorage.getItem(BOOT_PATH_KEY);
    sessionStorage.removeItem(BOOT_PATH_KEY);
  } catch {
    return;
  }

  if (!requested || !requested.startsWith(`${SYNTHETIC_FALLBACK}/`)) return;
  if (normalize(location.pathname) === normalize(requested)) return;

  history.replaceState(history.state, "", requested + location.search + location.hash);
}

/** Endereço do Adalove correspondente — o próprio, quando ele é real, ou o da
 *  Vida Acadêmica quando é um sintético nosso. Usado ao voltar para a UI
 *  original: o Adalove não sabe renderizar `/academic-life/atividades`. */
export function canonicalPath(pathname = location.pathname): string {
  const path = normalize(pathname);
  if (path === ROUTE_PATHS.atividades || path === ROUTE_PATHS.grupo) return SYNTHETIC_FALLBACK;
  if (path.startsWith(`${SYNTHETIC_FALLBACK}/`)) return SYNTHETIC_FALLBACK;
  return path;
}
