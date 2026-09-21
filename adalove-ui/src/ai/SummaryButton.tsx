import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  Layers,
  Package,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AI_PROVIDERS, MAX_URL_PROMPT_CHARS, type AiProvider } from "~/ai/providers";
import {
  buildSprints,
  buildSubjects,
  buildSummaryPrompt,
  type SummaryScope,
} from "~/ai/summary";
import type { SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { Logo } from "~/lib/logos";
import { copyText } from "~/lib/prefs";
import { useToast } from "~/ui/Toast";

/** Rótulo do escopo no botão de voltar, que é a única pista do que foi escolhido
 *  no passo anterior. */
function scopeLabel(scope: SummaryScope): string {
  if (scope.kind === "module") return "Módulo inteiro";
  if (scope.kind === "sprint") return `${scope.sprint.label} · ${scope.sprint.weeksLabel}`;
  return scope.subject.label;
}

/** Dois passos: escolher o escopo, depois a IA. Colocar as quatro IAs em cada
 *  linha de escopo daria 28 botões num menu — ilegível. */
export function SummaryButton({ view }: { view: SectionView }) {
  const [open, setOpen] = useState(false);
  // `undefined` é o primeiro passo (escolher escopo); definido é o segundo
  // (escolher a IA).
  const [scope, setScope] = useState<SummaryScope | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const subjects = buildSubjects(view);
  const sprints = buildSprints(view);

  // `composedPath` enxerga através do shadow root — `target` seria sempre o host.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !e.composedPath().includes(wrapRef.current)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close() {
    setOpen(false);
    setScope(undefined);
  }

  async function send(target: AiProvider | "copy") {
    const prompt = buildSummaryPrompt(view, scope ?? { kind: "module" });
    close();

    if (target === "copy") {
      const copied = await copyText(prompt);
      toast.toast(copied ? "Resumo copiado." : "Não consegui copiar.", copied ? "success" : "error");
      return;
    }

    // Um resumo de módulo passa fácil do teto de URL; nesse caso vai pelo
    // clipboard, senão o destino truncaria em silêncio.
    if (!target.supportsPrefill || prompt.length > MAX_URL_PROMPT_CHARS) {
      const copied = await copyText(prompt);
      window.open(target.buildUrl(prompt), "_blank", "noopener,noreferrer");
      toast.toast(
        copied
          ? `Resumo copiado — cole no ${target.label}.`
          : `Não consegui copiar. Abra o ${target.label} e peça o resumo.`,
        copied ? "success" : "error",
      );
      return;
    }
    window.open(target.buildUrl(prompt), "_blank", "noopener,noreferrer");
  }

  const rowClass =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg-soft transition-colors hover:bg-surface-hover hover:text-fg";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-xs font-medium transition-colors duration-150",
          open
            ? "border-accent bg-surface-hover text-fg"
            : "border-line bg-surface text-fg-soft hover:border-accent hover:text-fg",
        )}
      >
        <Sparkles size={14} aria-hidden />
        Resumir com IA
        {/* Também abre um menu: mesma indicação das linhas de dentro. */}
        <ChevronDown
          size={12}
          aria-hidden
          className={cn("transition-transform duration-200", open && "-rotate-90")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-2xl">
          {scope === undefined ? (
            <>
              <div className="px-3 py-1.5 text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                Resumir
              </div>

              <button
                type="button"
                onClick={() => setScope({ kind: "module" })}
                className={rowClass}
              >
                <Layers size={13} aria-hidden className="shrink-0 text-accent" />
                <span className="flex-1 font-medium text-fg">Módulo inteiro</span>
                <span className="font-mono text-[0.62rem] text-fg-muted tabular">
                  {view.activities.length}
                </span>
                {/* Chevron: esta linha leva a outro passo, não executa nada. */}
                <ChevronRight size={12} aria-hidden className="shrink-0 text-fg-muted" />
              </button>

              {/* Sprint vem antes de matéria: é o corte do PROJETO, que é o que
                  o módulo entrega. A contagem mostrada é de artefatos, não de
                  atividades — é sobre eles que o resumo fala. */}
              {sprints.length > 0 && (
                <>
                  <div className="my-1 h-px bg-line" />
                  <div className="px-3 py-1.5 text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                    Por sprint
                  </div>
                  {sprints.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setScope({ kind: "sprint", sprint: s })}
                      className={rowClass}
                    >
                      <Package size={13} aria-hidden className="shrink-0 text-fg-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fg">{s.label}</span>
                        <span className="block truncate text-[0.58rem] text-fg-muted">
                          {s.weeksLabel}
                        </span>
                      </span>
                      <span className="font-mono text-[0.62rem] text-fg-muted tabular">
                        {s.artifacts.length > 0
                          ? `${s.artifacts.length} artefato${s.artifacts.length > 1 ? "s" : ""}`
                          : "—"}
                      </span>
                      <ChevronRight size={12} aria-hidden className="shrink-0 text-fg-muted" />
                    </button>
                  ))}
                </>
              )}

              {subjects.length > 0 && (
                <>
                  <div className="my-1 h-px bg-line" />
                  <div className="px-3 py-1.5 text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                    Por matéria
                  </div>
                  {subjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setScope({ kind: "subject", subject: s })}
                      className={rowClass}
                      title={s.professor ?? undefined}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{s.label}</span>
                        {s.professor && (
                          <span className="block truncate text-[0.58rem] text-fg-muted">
                            {s.professor}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[0.62rem] text-fg-muted tabular">
                        {s.activities.length}
                      </span>
                      <ChevronRight size={12} aria-hidden className="shrink-0 text-fg-muted" />
                    </button>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setScope(undefined)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[0.62rem] text-fg-muted transition-colors hover:text-fg"
              >
                <ArrowLeft size={11} aria-hidden />
                {scopeLabel(scope)}
              </button>
              <div className="my-1 h-px bg-line" />

              {AI_PROVIDERS.map((p) => (
                <button key={p.id} type="button" onClick={() => void send(p)} className={rowClass}>
                  <Logo name={p.logo} size={15} />
                  <span className="flex-1">{p.label}</span>
                  {!p.supportsPrefill && (
                    <span className="text-[0.55rem] text-fg-muted">copiar e abrir</span>
                  )}
                  {/* Abre outro app, em outra aba. */}
                  <ExternalLink size={11} aria-hidden className="shrink-0 text-fg-muted" />
                </button>
              ))}

              <div className="my-1 h-px bg-line" />
              <button type="button" onClick={() => void send("copy")} className={rowClass}>
                <ClipboardCopy size={13} aria-hidden />
                Copiar prompt
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
