import { daysUntil, plural } from "~/ai/exam";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { addDays, dayKey, dayParts, startOfWeek, WEEKDAY_SHORT } from "~/lib/date";
import { CardTitle } from "~/ui/Card";

// Quanto tempo sobrou, em dias e em calendário.
//
// O número sozinho ("faltam 9 dias") não diz o que 9 dias são: quantos fins de
// semana cabem ali, quantas aulas ainda vão acontecer, se a prova cai na semana
// que vem ou na outra. A grade responde isso de relance — é a mesma leitura da
// aba Calendário (sete colunas de segunda a domingo, dia de hoje em círculo
// cheio), reduzida ao trecho entre hoje e a prova.

/** Teto de semanas desenhadas. Prova a três meses viraria uma parede de
 *  quadradinhos que não ajuda ninguém a se organizar; aí a grade mostra o
 *  começo e o número grande continua dizendo o resto. */
const MAX_WEEKS = 6;

interface Day {
  iso: string;
  key: string;
  /** Dia do mês, já com zero à esquerda. */
  label: string;
  isToday: boolean;
  isPast: boolean;
  isExam: boolean;
  /** Dentro da janela que ainda dá para estudar: de hoje até a véspera. */
  counts: boolean;
  /** Tem encontro marcado — os dias em que ainda se vê matéria nova. */
  hasClass: boolean;
}

export function ProvaCountdown({
  exam,
  view,
  now = new Date(),
  needed,
  neededColor,
  neededHint,
}: {
  exam: ActivityView | null;
  view: SectionView;
  now?: Date;
  /** Nota que ainda falta tirar. Mora aqui, embaixo do calendário, porque é a
   *  outra metade da mesma pergunta: quanto tempo falta e quanto falta tirar. */
  needed?: string;
  neededColor?: string;
  neededHint?: string;
}) {
  const days = daysUntil(exam?.date ?? null, now);
  const examKey = dayKey(exam?.date ?? null);

  // Dias com encontro: é o que separa "9 dias" de "9 dias, 4 deles com aula".
  const classDays = new Set(
    view.activities
      .filter((a) => a.attendance.length > 0)
      .map((a) => dayKey(a.date))
      .filter((k): k is string => !!k),
  );

  const todayIso = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  ).toISOString();
  const todayKey = dayKey(todayIso)!;

  // A grade começa na segunda da semana corrente — a mesma âncora da aba
  // Calendário, para as duas telas mostrarem a semana do mesmo jeito.
  const firstMonday = startOfWeek(todayIso);
  const lastDay = exam?.date && days !== null && days > 0 ? exam.date : todayIso;
  const lastMonday = startOfWeek(lastDay);

  const weeks: Day[][] = [];
  if (firstMonday && lastMonday) {
    const span = Math.round(
      (Date.parse(lastMonday) - Date.parse(firstMonday)) / (7 * 86_400_000),
    );
    const total = Math.min(Math.max(span + 1, 1), MAX_WEEKS);

    for (let w = 0; w < total; w++) {
      const monday = addDays(firstMonday, w * 7);
      weeks.push(
        Array.from({ length: 7 }, (_, i) => {
          const iso = addDays(monday, i);
          const key = dayKey(iso)!;
          const parts = dayParts(iso, now);
          return {
            iso,
            key,
            label: parts?.day ?? "",
            isToday: key === todayKey,
            isPast: key < todayKey,
            isExam: key === examKey,
            counts: key >= todayKey && (!examKey || key < examKey),
            hasClass: classDays.has(key),
          };
        }),
      );
    }
  }

  const truncated = !!firstMonday && !!lastMonday && weeks.length === MAX_WEEKS;
  const classesLeft = weeks
    .flat()
    .filter((d) => d.counts && d.hasClass && d.key !== todayKey).length;

  return (
    <div className="min-w-0">
      <CardTitle>Contagem para a prova</CardTitle>

      <div className="mt-3 flex items-baseline gap-2">
        {days === null ? (
          <span className="text-sm text-fg-muted">Sem data no Adalove</span>
        ) : days > 0 ? (
          <>
            <span className="font-mono text-3xl font-medium tracking-tight text-fg tabular">
              {days}
            </span>
            <span className="text-xs text-fg-soft">
              {days === 1 ? "dia até a prova" : "dias até a prova"}
            </span>
          </>
        ) : days === 0 ? (
          <span className="font-mono text-2xl font-medium tracking-tight text-prova">É hoje</span>
        ) : (
          <span className="text-sm text-fg-muted">Prova já realizada</span>
        )}
      </div>

      {days !== null && days > 0 && (
        <p className="mt-1 text-[0.68rem] text-fg-muted">
          {classesLeft > 0
            ? `${plural(classesLeft, "dia de aula", "dias de aula")} pela frente`
            : "sem mais encontros antes dela"}
        </p>
      )}

      {weeks.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-card border border-line">
          <div className="grid grid-cols-7 bg-bg/40">
            {WEEKDAY_SHORT.map((label) => (
              <div
                key={label}
                className="border-l border-line-soft py-1 text-center text-[0.5rem] uppercase tracking-[0.06em] text-fg-muted first:border-l-0"
              >
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week, i) => (
            <div key={week[0]?.iso ?? i} className="grid grid-cols-7 border-t border-line-soft">
              {week.map((day) => (
                <div
                  key={day.iso}
                  className={cn(
                    "flex flex-col items-center gap-0.5 border-l border-line-soft py-1.5 first:border-l-0",
                    day.isPast && "bg-bg/40",
                    // Faixa levíssima nos dias que ainda dá para estudar: é ela
                    // que transforma "9 dias" em um trecho que se vê.
                    day.counts && "bg-accent/[0.07]",
                  )}
                >
                  <span
                    // Mesmos três estados da aba Calendário, mais o da prova:
                    // hoje em círculo cheio, o dia da prova na cor da categoria
                    // (a mesma do donut de peso e do cartão de nota).
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[0.62rem] tabular",
                      day.isExam
                        ? "bg-prova font-medium"
                        : day.isToday
                          ? "bg-accent font-medium text-white"
                          : day.counts
                            ? "text-fg-soft"
                            : "text-fg-muted opacity-60",
                    )}
                    style={
                      // O rosa da categoria Prova é claro nos dois temas: branco
                      // em cima dele dá 2,2:1 e o número some. A tinta sai da
                      // própria cor, escurecida, então ela acompanha o token se
                      // ele mudar — e não depende de tema, como o rosa também
                      // não depende.
                      day.isExam
                        ? { color: "color-mix(in srgb, var(--color-prova) 25%, #000)" }
                        : undefined
                    }
                    title={day.isExam ? exam?.caption : undefined}
                  >
                    {day.label}
                  </span>
                  {/* Ponto de aula: só nos dias que ainda contam, senão a grade
                      vira um mapa do passado em vez do que falta. */}
                  <span
                    aria-hidden
                    className={cn(
                      "size-1 rounded-full",
                      day.hasClass && day.counts && !day.isExam ? "bg-fg-muted" : "bg-transparent",
                    )}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {truncated && (
        <p className="mt-2 text-[0.6rem] text-fg-muted">
          Mostrando as {MAX_WEEKS} primeiras semanas.
        </p>
      )}

      {needed && (
        <div className="mt-4 flex items-baseline gap-2 border-t border-line-soft pt-3">
          <span className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
            Nota necessária
          </span>
          <span
            className="font-mono text-lg font-medium tracking-tight tabular"
            style={{ color: neededColor ?? "var(--color-fg)" }}
          >
            {needed}
          </span>
          {neededHint && (
            <span className="min-w-0 flex-1 text-[0.6rem] leading-tight text-fg-muted">
              {neededHint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
