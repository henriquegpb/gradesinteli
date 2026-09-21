import type { CSSProperties } from "react";
import { STATUS_DOING, STATUS_DONE, STATUS_LABEL, STATUS_TODO } from "~/data/types";
import type { SectionView, WeekGroup } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { CARD_CLASS, Card, CardTitle } from "~/ui/Card";

// Reprodução do resumo por semana do Adalove ("Minhas atividades"): três barras
// com altura proporcional à fatia que cada coluna do kanban ocupa na semana, e o
// número de atividades ainda não concluídas.

const COLUMNS = [
  { status: STATUS_TODO, color: "var(--color-fg-muted)" },
  { status: STATUS_DOING, color: "var(--color-yellow)" },
  { status: STATUS_DONE, color: "var(--color-green)" },
] as const;

function WeekCard({ week, onOpen }: { week: WeekGroup; onOpen?: (week: string) => void }) {
  const counts = COLUMNS.map((c) => week.activities.filter((a) => a.status === c.status).length);
  const pending = counts[0]! + counts[1]!;

  // A altura é a fatia da SEMANA, não a fatia da maior coluna. Normalizando pelo
  // maior, a coluna mais alta enchia a barra sempre — "Feito" aparecia cheio com
  // 18 de 22 cards, dizendo que a semana estava fechada quando faltavam quatro.
  //
  // Como todo card tem exatamente um dos três status, as três barras somam a
  // altura toda e passam a ser partes de um inteiro: o mesmo inteiro que o
  // "22 atividades" no canto anuncia.
  const total = Math.max(week.activities.length, 1);

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-medium text-fg">{week.label}</span>
        <span className="font-mono text-xs text-fg-muted tabular">
          {week.activities.length} atividades
        </span>
      </div>
      <div className={cn("mt-1 text-xs", pending > 0 ? "text-fg-soft" : "text-green")}>
        {pending > 0 ? `${pending} não concluída${pending > 1 ? "s" : ""}` : "Tudo concluído"}
      </div>

      {/* Contagem fora da barra: dentro dela ficaria ilegível sempre que a
          coluna tivesse poucos itens, que é justamente o caso interessante. */}
      <div className="mt-4 flex h-24 items-end gap-2">
        {COLUMNS.map((column, i) => {
          const count = counts[i]!;
          return (
            <div
              key={column.status}
              title={`${STATUS_LABEL[column.status]}: ${count}`}
              className="flex h-full flex-1 flex-col justify-end rounded-[4px] bg-line-soft"
            >
              <div
                className="gi-glow rounded-[4px] transition-[height] duration-500"
                style={
                  {
                    // Piso de 6% para uma coluna de 1 card não virar um fio
                    // invisível numa semana de 22.
                    height: `${Math.max((count / total) * 100, count > 0 ? 6 : 0)}%`,
                    "--gi-glow": column.color,
                  } as CSSProperties
                }
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {COLUMNS.map((column, i) => (
          <span
            key={column.status}
            className="flex-1 text-center font-mono text-xs tabular"
            style={{ color: counts[i]! > 0 ? column.color : "var(--color-fg-muted)" }}
          >
            {counts[i]}
          </span>
        ))}
      </div>
    </>
  );

  if (!onOpen) {
    return <Card className="px-4 py-4">{body}</Card>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(week.label)}
      className={cn(
        CARD_CLASS,
        // `gi-shortcut` é o gancho do Super Tech (theme.css): lá o contorno do
        // card é transparente, então o `hover:border-accent` não tinha o que
        // pintar e o card ficava sem resposta ao mouse. A classe troca o hover
        // pela luz interna, do mesmo jeito que nos cards-atalho da Visão geral.
        "gi-shortcut w-full cursor-pointer px-4 py-4 text-left transition-colors duration-150 hover:border-accent",
      )}
    >
      {body}
    </button>
  );
}

export function WeeksOverview({
  view,
  onOpenWeek,
}: {
  view: SectionView;
  onOpenWeek?: (week: string) => void;
}) {
  if (!view.weeks.length) return null;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <CardTitle>Semanas</CardTitle>
        <div className="flex items-center gap-3">
          {COLUMNS.map((c) => (
            <span key={c.status} className="inline-flex items-center gap-1.5 text-[0.62rem] text-fg-muted">
              <span aria-hidden className="size-2 rounded-[2px]" style={{ background: c.color }} />
              {STATUS_LABEL[c.status]}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {view.weeks.map((week) => (
          <WeekCard key={week.key} week={week} onOpen={onOpenWeek} />
        ))}
      </div>
    </section>
  );
}
