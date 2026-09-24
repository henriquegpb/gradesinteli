// Lado isolado do modo de captura. Recebe o que o adalove-capture.js observa,
// guarda UMA resposta por endpoint e exporta tudo num JSON só.
//
// Dedupar por endpoint é o que mantém isso utilizável: a mesma página chama o
// mesmo endpoint várias vezes, e o que queremos é o contrato, não o histórico.

import { ext } from "~/lib/ext";

const TAG = "__GRADESINTELI_CAPTURE__";
const MODE_KEY = "captureMode";
const STORE_KEY = "captures";
const BADGE_ID = "gi-capture-badge";

/** Corpos maiores que isso são registrados sem body: um único payload gigante
 *  estouraria a cota do chrome.storage e levaria o resto embora. */
const MAX_BODY = 1_200_000;
const MAX_ENTRIES = 120;

interface Capture {
  method: string;
  url: string;
  /** Chave de dedupe: método + caminho, sem query e sem uuids. */
  key: string;
  status: number;
  body: string | null;
  skipped?: "muito grande";
  at: number;
}

let enabled = false;
let captures = new Map<string, Capture>();

/** Troca uuids e ids numéricos por `:id` para que a mesma rota com parâmetros
 *  diferentes não vire dez entradas. */
function endpointKey(method: string, url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split("?")[0] ?? url;
  }
  // Os uuids do Adalove são hex sem hífen, mas não custa cobrir a forma
  // canônica e ids alfanuméricos longos. O piso de 20 caracteres sem hífen não
  // pega nenhum segmento real de rota: o maior deles é "recommendations" (15),
  // e os compostos têm hífen.
  const generic = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, "/:uuid")
    .replace(/\/[0-9a-z]{20,40}(?=\/|$)/gi, "/:uuid")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
  return `${method.toUpperCase()} ${generic}`;
}

function renderBadge() {
  const existing = document.getElementById(BADGE_ID);
  if (!enabled) {
    existing?.remove();
    return;
  }

  const badge =
    existing ??
    (() => {
      const el = document.createElement("div");
      el.id = BADGE_ID;
      Object.assign(el.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: "2147483001",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        background: "#16161a",
        color: "#e0e0e4",
        border: "1px solid #d4b843",
        borderRadius: "8px",
        font: "12px system-ui, -apple-system, sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,.4)",
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(el);
      return el;
    })();

  badge.textContent = "";

  const count = document.createElement("span");
  count.textContent = `⏺ ${captures.size} endpoint${captures.size === 1 ? "" : "s"}`;
  count.style.color = "#d4b843";
  badge.appendChild(count);

  for (const [label, action] of [
    ["Exportar", () => void exportCaptures()],
    ["Parar", () => void setCaptureMode(false)],
  ] as const) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: "3px 8px",
      background: "transparent",
      color: "#a0a0aa",
      border: "1px solid #2a2a30",
      borderRadius: "5px",
      font: "inherit",
      cursor: "pointer",
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener("click", action);
    badge.appendChild(btn);
  }
}

async function persist() {
  try {
    await ext!.storage.local.set({ [STORE_KEY]: [...captures.values()] });
  } catch {
    /* cota cheia: seguimos com o que está em memória */
  }
}

function record(method: string, url: string, status: number, body: string) {
  const key = endpointKey(method, url);
  const tooBig = body.length > MAX_BODY;

  captures.set(key, {
    method: method.toUpperCase(),
    url,
    key,
    status,
    body: tooBig ? null : body,
    ...(tooBig ? { skipped: "muito grande" as const } : {}),
    at: Date.now(),
  });

  // Mantém as mais recentes se passar do teto.
  if (captures.size > MAX_ENTRIES) {
    const ordered = [...captures.entries()].sort((a, b) => a[1].at - b[1].at);
    captures = new Map(ordered.slice(ordered.length - MAX_ENTRIES));
  }

  renderBadge();
  void persist();
}

export async function exportCaptures() {
  const payload = {
    capturedAt: new Date().toISOString(),
    origin: location.origin,
    count: captures.size,
    entries: [...captures.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `adalove-capturas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function setCaptureMode(on: boolean) {
  enabled = on;
  await ext!.storage.local.set({ [MODE_KEY]: on });
  renderBadge();
}

export async function clearCaptures() {
  captures.clear();
  await ext!.storage.local.remove(STORE_KEY);
  renderBadge();
}

const CMD_TAG = "__GRADESINTELI_CAPTURE_CMD__";
const REPLY_TAG = "__GRADESINTELI_CAPTURE_REPLY__";

/** Comandos vindos do console (mundo da página) via adalove-capture.js. */
async function handleCommand(cmd: string): Promise<unknown> {
  switch (cmd) {
    case "on":
      await setCaptureMode(true);
      return `captura ligada: ${captures.size} endpoint(s) na memória`;
    case "off":
      await setCaptureMode(false);
      return "captura desligada";
    case "clear":
      await clearCaptures();
      return "capturas apagadas";
    case "export":
      await exportCaptures();
      return `exportado: ${captures.size} endpoint(s)`;
    case "list":
      return [...captures.keys()].sort();
    default:
      return `comando desconhecido: ${cmd}`;
  }
}

export async function initCapture() {
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const data = e.data as
      | {
          source?: string;
          method?: string;
          url?: string;
          status?: number;
          body?: string;
          cmd?: string;
          id?: number;
        }
      | null;
    if (!data) return;

    if (data.source === CMD_TAG && typeof data.cmd === "string") {
      void handleCommand(data.cmd).then((result) => {
        window.postMessage(
          { source: REPLY_TAG, id: data.id, result },
          location.origin,
        );
      });
      return;
    }

    if (data.source !== TAG) return;
    if (!enabled || typeof data.url !== "string" || typeof data.body !== "string") return;
    record(data.method ?? "GET", data.url, data.status ?? 0, data.body);
  });

  const stored = (await ext!.storage.local.get([MODE_KEY, STORE_KEY])) as {
    captureMode?: boolean;
    captures?: Capture[];
  };
  enabled = stored.captureMode === true;
  if (Array.isArray(stored.captures)) {
    captures = new Map(stored.captures.map((c) => [c.key, c]));
  }
  if (enabled) renderBadge();

}
