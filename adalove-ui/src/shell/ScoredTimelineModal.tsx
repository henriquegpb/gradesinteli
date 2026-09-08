import { CalendarClock } from "lucide-react";
import { useEffect, useRef } from "react";
import { fmtNota } from "@/lib/format";
import { CATEGORY_COLOR } from "~/data/activityTypes";
import { scoredTimeline } from "~/data/schedule";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { Modal } from "~/ui/Modal";

// O módulo inteiro numa linha só, rolando na horizontal: passado à esquerda
// (esmaecido, com a nota no lugar do peso), o que vem pela frente à direita, e
// uma marca de "hoje" na virada. É a régua do cabeçalho aberta por inteiro — a
// tabela de Notas responde "quanto eu tenho"; isto responde "quando cai o quê".

/** Largura da coluna, altura do bloco de título e diâmetro do ponto. O trilho e
 *  a marca de "hoje" são posicionados a partir destes três números, então eles
 *  não podem virar valores soltos no meio da marcação — é daqui que as contas
 *  saem, e é por isso que a linha passa exatamente pelo miolo de cada ponto. */
const COL = 176;
const HEAD = 56;
const DOT = 10;

export function ScoredTimelineModal({
  view,
  onClose,
  onOpenActivity,
}: {
  view: SectionView;
  onClose: () => void;
  onOpenActivity: (activity: ActivityView) => void;
}) {
  const entries = scoredTimeline(view, new Date());
  const firstAhead = entries.findIndex((e) => !e.past);
  const graded = entries.filter((e) => e.activity.grade !== null).length;
  const scroller = useRef<HTMLDivElement>(null);

  // Abre já na virada, com o passado recente à vista à esquerda. Sem isto o
  // modal abre na Semana 01 — o pedaço que menos interessa em qualquer dia que
  // não seja o primeiro do módulo.
  useEffect(() => {
    const el = scroller.current;
    if (!el || firstAhead <= 0) return;
    el.scrollLeft = Math.max(0, firstAhead * COL - el.clientWidth / 3);
  }, [firstAhead]);

  // Só as categorias que este módulo realmente tem: em GRAD CC a Autoavaliação
  // não existe, e uma legenda com item morto ensina errado.
  const legend = [...new Set(entries.map((e) => e.activity.category))];

  return (
    <Modal
      open
      onClose={onClose}
      // A altura padrão do modal (85dvh) é para conteúdo que rola na vertical;
      // aqui o conteúdo é uma faixa só, e sobrariam 500px de vazio em volta.
      className="h-auto max-h-[85dvh] max-w-[1100px]"
      icon={
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-control bg-accent/15">
          <CalendarClock size={15} aria-hidden className="text-accent" />
        </span>
      }
      title="Linha do tempo do módulo"
      subtitle={`${entries.length} atividades com pontuação · ${graded} já avaliadas`}
    >
      {entries.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhuma atividade com pontuação nesta turma.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {legend.map((category) => (
              <li key={category} className="flex items-center gap-1.5 text-[0.62rem] text-fg-muted">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: CATEGORY_COLOR[category] ?? "var(--color-fg-muted)" }}
                />
                {category}
              </li>
            ))}
          </ul>

          {/* `-mx-4 px-4` desfaz e refaz o respiro do modal: a barra de rolagem
              vai de ponta a ponta, mas a primeira e a última coluna continuam
              com a mesma margem do resto do conteúdo. */}
          <div ref={scroller} className="-mx-4 overflow-x-auto px-4 pb-2">
            <ol className="relative flex min-w-max">
              <span
                aria-hidden
                className="absolute rounded-full bg-line"
                style={{ top: HEAD + DOT / 2 - 1, height: 2, left: COL / 2, right: COL / 2 }}
              />

              {/* A virada. Só quando há passado: com tudo pela frente ela cairia
                  na borda esquerda e o rótulo sairia cortado pela metade. */}
              {firstAhead > 0 && (
                <>
                  <span
                    aria-hidden
                    className="absolute bottom-0 top-4 border-l border-dashed border-fg-muted/50"
                    style={{ left: firstAhead * COL }}
                  />
                  <span
                    className="absolute top-0 -translate-x-1/2 rounded-full border border-line bg-surface px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-fg-muted"
                    style={{ left: firstAhead * COL }}
                  >
                    hoje
                  </span>
                </>
              )}

              {entries.map(({ activity, past }, i) => {
                const color = CATEGORY_COLOR[activity.category] ?? "var(--color-fg-muted)";
                const next = i === firstAhead;

                return (
                  <li
                    key={activity.id}
                    className={cn("relative flex shrink-0", past && "opacity-50")}
                    style={{ width: COL }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenActivity(activity)}
                      className="group flex w-full cursor-pointer flex-col items-center px-2 focus-visible:outline-none"
                    >
                      {/* Alinhado por baixo: o título encosta sempre no ponto,
                          venha ele em uma linha ou em duas. */}
                      <span
                        className="flex w-full flex-col items-center justify-end gap-1 pb-1.5 text-center"
                        style={{ height: HEAD }}
                      >
                        <span className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-fg-muted">
                          {activity.week}
                        </span>
                        <span className="line-clamp-2 text-[0.72rem] leading-tight text-fg-soft transition-colors duration-150 group-hover:text-fg group-focus-visible:text-fg">
                          {activity.caption}
                        </span>
                      </span>

                      <span
                        aria-hidden
                        className="rounded-full transition-transform duration-150 group-hover:scale-125 group-focus-visible:scale-125"
                        style={{
                          width: DOT,
                          height: DOT,
                          background: color,
                          // O vão do anel é pintado com o fundo do MODAL, não o
                          // da página: aqui o trilho passa sobre `--color-surface`.
                          boxShadow: next
                            ? `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${color}`
                            : undefined,
                        }}
                      />

                      <span className="mt-3 flex flex-col items-center gap-0.5">
                        {past && (
                          <span className="font-mono text-sm font-medium text-fg tabular">
                            {fmtNota(activity.grade)}
                          </span>
                        )}
                        <span className="text-[0.6rem] text-fg-muted">
                          {activity.weight} {activity.weight === 1 ? "ponto" : "pontos"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}
