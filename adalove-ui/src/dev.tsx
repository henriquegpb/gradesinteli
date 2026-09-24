// Entry do harness de dev: roda em localhost:5173 com HMR, contra um fixture
// gravado. É aqui que 95% do trabalho de UI acontece — sem Adalove, sem rede,
// sem recarregar extensão.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "~/App";
import { Login } from "~/screens/Login";
import { SkeletonShell } from "~/ui/Skeleton";
import { fixtureNameFor, type ApiClient } from "~/data/api";
import { avatarUrl, type AdaloveUser } from "~/data/client";
import type { RawUserdata } from "~/data/types";
import type { RouteId } from "~/shell/nav";
import "~/theme.css";

const FIXTURES = import.meta.glob<{ default: RawUserdata }>("../fixtures/*.json");
const ALL_FIXTURES = import.meta.glob<{ default: unknown }>("../fixtures/*.json");

interface SectionRow {
  uuid: string;
  caption?: string | null;
  projectCaption?: string | null;
  status?: string | null;
}

/** Só existe UM /userdata gravado: trocar de turma no harness devolveria a mesma
 *  tela e o seletor pareceria quebrado. Carimbamos no fixture a identidade da
 *  turma pedida (uuid, nome, projeto) para exercitar o seletor de ponta a ponta.
 *  As notas e os cards seguem sendo os do fixture — aqui só se testa a UI. */
async function stampSection(path: string, data: unknown): Promise<unknown> {
  const uuid = /^\/sections\/([0-9a-f]{24,36})\/userdata/i.exec(path)?.[1];
  if (!uuid || !data || typeof data !== "object") return data;

  const key = Object.keys(ALL_FIXTURES).find((k) => k.endsWith("/sections.json"));
  if (!key) return data;

  const rows = (await ALL_FIXTURES[key]!()).default as SectionRow[];
  const row = Array.isArray(rows) ? rows.find((s) => s.uuid === uuid) : null;
  if (!row) return data;

  const raw = data as RawUserdata;
  return {
    ...raw,
    section: {
      ...raw.section,
      sectionUuid: row.uuid,
      sectionCaption: row.caption ?? raw.section?.sectionCaption ?? null,
      projectCaption: row.projectCaption ?? raw.section?.projectCaption ?? null,
    },
  };
}

/** O pedido de revisão é o único endpoint que NÃO vem de fixture: as capturas
 *  de `data/` são anteriores ao recurso, e estes payloads foram escritos a
 *  partir do contrato do bundle deles, não gravados de um aluno. Inventar um
 *  arquivo em `fixtures/` faria passar por captura o que é encenação — e
 *  `fixtures/*.json` é ignorado pelo git, então num clone novo o harness ficaria
 *  sem o endpoint.
 *
 *  `?revision=` escolhe o desfecho; sem o parâmetro vale `open`, que é o estado
 *  em que o formulário aparece. */
const REVISION_VARIANTS: Record<string, unknown> = {
  /** Prazo aberto, nenhum pedido feito. */
  open: { canRequest: true, deadlineAt: "2026-09-28T23:59:00", revision: null },
  /** Nota não publicada: a seção inteira some. */
  none: { canRequest: false, deadlineAt: null, revision: null },
  /** Prazo vencido sem ninguém ter pedido. */
  late: { canRequest: false, deadlineAt: "2026-09-18T23:59:00", revision: null },
  pending: {
    canRequest: false,
    deadlineAt: "2026-09-28T23:59:00",
    revision: {
      uuid: "b41e0b0c9a7f4d1e9d2c5a83f6e7c012",
      status: "pending",
      reason:
        "A rubrica pedia um diagrama de sequência e um de implantação. Entreguei os dois na pasta /docs do repositório, mas o feedback só cita o de sequência — acho que o segundo passou batido na correção.",
      requestedAt: "2026-09-24T14:32:00",
      decidedAt: null,
      professorResponse: null,
      gradeResultPrevious: 7.5,
    },
  },
  deferred: {
    canRequest: false,
    deadlineAt: "2026-09-28T23:59:00",
    revision: {
      uuid: "b41e0b0c9a7f4d1e9d2c5a83f6e7c012",
      status: "deferred",
      reason:
        "A rubrica pedia um diagrama de sequência e um de implantação. Entreguei os dois na pasta /docs do repositório, mas o feedback só cita o de sequência.",
      requestedAt: "2026-09-24T14:32:00",
      decidedAt: "2026-09-26T09:10:00",
      professorResponse:
        "<p>Confere: o diagrama de implantação estava no repositório e não foi considerado. Nota ajustada de 7,50 para 9,00.</p>",
      gradeResultPrevious: 7.5,
    },
  },
  /** Pedido com o objeto `revision` faltando tudo que o bundle deles prometeu.
   *  É o único risco que não dá para conferir contra a API: `revision` só chega
   *  preenchido depois de alguém pedir revisão de verdade, então os nomes dos
   *  campos seguem não exercitados. Aqui a seção tem que encolher — nunca
   *  quebrar, que levaria a overlay inteira junto. */
  broken: {
    canRequest: false,
    deadlineAt: "2026-09-28T23:59:00",
    revision: { status: "deferred" },
  },
  undeferred: {
    canRequest: false,
    deadlineAt: "2026-09-28T23:59:00",
    revision: {
      uuid: "b41e0b0c9a7f4d1e9d2c5a83f6e7c012",
      status: "undeferred",
      reason: "Acredito que o diagrama de implantação atende ao que a rubrica pedia.",
      requestedAt: "2026-09-24T14:32:00",
      decidedAt: "2026-09-26T09:10:00",
      professorResponse:
        "<p>O diagrama existe, mas não traz os nós de execução nem o mapeamento dos artefatos — que é o que o critério 3 avalia. Nota mantida.</p>",
      gradeResultPrevious: 7.5,
    },
  },
};

function revisionState(path: string): unknown | null {
  if (!path.startsWith("/student-activity-grade-revisions/")) return null;
  const want = new URLSearchParams(location.search).get("revision");
  return REVISION_VARIANTS[want ?? "open"] ?? REVISION_VARIANTS.open;
}

/** Cliente de dev: em vez de rede, resolve o fixture gerado por
 *  scripts/split-captures.mjs a partir do caminho do endpoint. */
const devApi: ApiClient = {
  get: async <T,>(path: string): Promise<T> => {
    // `?slow=3000` segura a resposta para dar tempo de inspecionar (e fotografar)
    // os skeletons; sem o parâmetro, só a latência simbólica de sempre.
    const slow = Number(new URLSearchParams(location.search).get("slow"));
    await new Promise((r) => setTimeout(r, Number.isFinite(slow) && slow > 0 ? slow : 120));

    const synthetic = revisionState(path);
    if (synthetic) return synthetic as T;

    const name = fixtureNameFor(path);
    const key = Object.keys(ALL_FIXTURES).find((k) => k.endsWith(`/${name}`));
    if (!key) {
      throw new Error(
        `Sem fixture para ${path} (esperado fixtures/${name}). ` +
          "Rode o modo de captura e scripts/split-captures.mjs.",
      );
    }
    return (await stampSection(path, (await ALL_FIXTURES[key]!()).default)) as T;
  },
  // Sem rede no harness: a escrita só resolve, para exercitar o optimistic update.
  put: async () => {
    await new Promise((r) => setTimeout(r, 200));
  },
  // `?fail=1` também aqui: é o que exercita o toast de erro do pedido de
  // revisão. O sucesso não muda o fixture — a releitura devolve o mesmo estado,
  // então para ver o pedido enviado use `?revision=pending`.
  post: async () => {
    await new Promise((r) => setTimeout(r, 400));
    if (new URLSearchParams(location.search).has("fail")) {
      throw new Error("falha simulada");
    }
    // As tarefas precisam de um uuid de volta para virar linha na lista; sem
    // ele o `key` do React repetiria e apagar a primeira apagaria a errada.
    return { uuid: crypto.randomUUID().replace(/-/g, "") };
  },
  delete: async () => {
    await new Promise((r) => setTimeout(r, 250));
    if (new URLSearchParams(location.search).has("fail")) {
      throw new Error("falha simulada");
    }
  },
  // Aqui não existe sessão para vencer nem para renovar, então `?expired=1` é o
  // que põe a faixa na tela — do contrário ela só apareceria numa aba do
  // Adalove cujo refresh token o Cognito tivesse recusado.
  ensureSession: async () =>
    new URLSearchParams(location.search).has("expired") ? "expired" : "ok",
};

/** Monta o usuário a partir do fixture de /users/details, quando existe. */
async function loadDevUser(): Promise<AdaloveUser> {
  const fallback: AdaloveUser = {
    name: "Henrique Gomes Pitol Barone",
    email: "henrique.barone@sou.inteli.edu.br",
    uuid: null,
    avatar: null,
  };
  const key = Object.keys(ALL_FIXTURES).find((k) => k.endsWith("/users-details.json"));
  if (!key) return fallback;

  try {
    const d = (await ALL_FIXTURES[key]!()).default as Record<string, string | null>;
    return {
      name: d.name ?? fallback.name,
      email: d.email ?? fallback.email,
      uuid: d.uuid ?? null,
      avatar: avatarUrl(d.avatar_filename ?? null, d.uuid ?? null),
    };
  } catch {
    return fallback;
  }
}

async function boot() {
  const el = document.getElementById("dev-root")!;
  el.classList.add("adalove-ui-root");

  const want = new URLSearchParams(location.search).get("fixture") ?? "henrique-2026-2A";
  const key = Object.keys(FIXTURES).find((k) => k.includes(want)) ?? Object.keys(FIXTURES)[0];

  if (!key) {
    el.textContent = "Nenhum fixture em adalove-ui/fixtures/.";
    return;
  }

  const mod = await FIXTURES[key]!();
  const devUser = await loadDevUser();
  const params = new URLSearchParams(location.search);
  const route = params.get("route") as RouteId | null;

  // Atalhos do harness: clicam na UI depois que ela monta, para inspecionar
  // estados internos sem clicar à mão — inclusive em screenshot headless.
  const clickAfterMount = (find: () => HTMLElement | undefined) =>
    setTimeout(() => find()?.click(), 400);

  // `?open=<n>` abre o n-ésimo card.
  if (params.has("open")) {
    const n = Number(params.get("open")) || 0;
    clickAfterMount(() => {
      const cards = document.querySelectorAll<HTMLButtonElement>("[data-activity-card]");
      return cards[Math.min(n, cards.length - 1)];
    });
  }

  // `?tab=Notas` clica num botão pelo rótulo visível ou pelo aria-label —
  // este último cobre os botões só de ícone, como o sino de notificações.
  // Aceita vários separados por vírgula, clicados em sequência:
  // `?tab=Notas,Copiar prompt`.
  const tab = params.get("tab");
  if (tab) {
    const steps = tab.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    steps.forEach((wanted, i) => {
      setTimeout(
        () =>
          [...document.querySelectorAll<HTMLButtonElement>("button")]
            .find((b) => {
              const text = b.textContent?.trim().toLowerCase() ?? "";
              const label = b.getAttribute("aria-label")?.trim().toLowerCase() ?? "";
              // Prefixo além da igualdade: botões-linha (o do simulador, por
              // exemplo) carregam valor e status no mesmo textContent.
              // Prefixo só para rótulos longos: com "a" casaria "Acadêmico"
              // antes do botão certo.
              const prefixOk = wanted.length >= 8;
              return (
                text === wanted ||
                label === wanted ||
                (prefixOk && (text.startsWith(wanted) || label.startsWith(wanted)))
              );
            })
            ?.click(),
        400 * (i + 1),
      );
    });
  }

  // `?login=1` abre a tela de entrada. O formulário é o de verdade: submeter
  // aqui fala com o Cognito da Inteli igual na extensão.
  if (params.has("login")) {
    createRoot(el).render(
      <StrictMode>
        <Login onDone={() => console.info("[dev] login ok")} />
      </StrictMode>,
    );
    return;
  }

  // `?skeleton=1` mostra o primeiro paint da extensão (antes do /userdata),
  // que no harness normal nunca aparece — o fixture já está em memória.
  if (params.has("skeleton")) {
    createRoot(el).render(
      <StrictMode>
        <SkeletonShell />
      </StrictMode>,
    );
    return;
  }

  createRoot(el).render(
    <StrictMode>
      <App
        raw={mod.default}
        initialRoute={route ?? undefined}
        api={devApi}
        // Sem localStorage do Adalove aqui: o usuário vem do fixture de
        // /users/details, o que exercita a foto real e o fallback de erro.
        user={devUser}
        // No harness sair não pode sair de nada: o item aparece no menu da conta
        // para poder ser visto e fotografado, e só registra o clique.
        onLogout={() => console.info("[dev] logout")}
        // Sem rede no harness: o drag funciona e o optimistic update é exercido,
        // só não há PUT. `?fail=1` força o caminho de erro para testar o rollback.
        persistStatus={async () => {
          await new Promise((r) => setTimeout(r, 250));
          if (new URLSearchParams(location.search).has("fail")) {
            throw new Error("falha simulada");
          }
        }}
        // Mesma ideia para o autosave de resposta, anotações e tags: exercita
        // "Salvando…/Salvo" sem rede, e `?fail=1` exercita o "Não salvo".
        persistFields={async () => {
          await new Promise((r) => setTimeout(r, 400));
          if (new URLSearchParams(location.search).has("fail")) {
            throw new Error("falha simulada");
          }
        }}
      />
    </StrictMode>,
  );
}

void boot();
