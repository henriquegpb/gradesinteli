import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AskAiButtons } from "~/ai/AskAiButton";
import { axisName, CATEGORY_COLOR } from "~/data/activityTypes";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { addDays, dayKey, dayParts, startOfWeek, WEEKDAY_SHORT } from "~/lib/date";
import { Badge } from "~/ui/Badge";
import { Card, CardTitle } from "~/ui/Card";

// Grade semanal no formato de calendário: sete colunas de segunda a domingo,
// uma linha por semana letiva.
//
// Só os ENCONTROS têm `date` no /userdata (47 de 200 no fixture, tipos 1 e 2).
// Autoestudos, artefatos e a prova vêm sem data — só com a semana. Então eles
// ficam listados abaixo da grade da sua semana, em vez de inventarmos um dia.

const UNDATED_CAP = 4;

// O que vale nota vem primeiro, e os autoestudos (que são a maioria) por
// último. Prova entra junto do bloco avaliado; aparece uma vez no módulo.
const CATEGORY_ORDER: Record<string, number> = {
  Ponderada: 0,
  Artefato: 1,
  Autoavaliação: 2,
  Prova: 3,
  Grupo: 4,
  Aula: 5,
};

/** `sort` é estável, então dentro de cada categoria a ordem original
 *  (semana, depois o `sort` da API) é preservada. */
function byCategory(activities: ActivityView[]): ActivityView[] {
  return [...activities].sort(
    (a, b) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9),
  );
}

/** Encontro de Orientação (sprint planning, review, prova, workshop) vem sem
 *  eixo no /userdata, e não é omissão deles: esse encontro não pertence a
 *  matéria nenhuma. Então o rótulo passa a ser o próprio tipo do encontro —
 *  assim todo card do dia tem o de trás, e a grade não fica dente de serra. */
const ENCOUNTER_LABEL: Record<number, string> = { 1: "Orientação", 2: "Instrução" };

function subjectLabel(a: ActivityView): string {
  return axisName(a.axis) ?? ENCOUNTER_LABEL[a.kind.id] ?? a.kind.name;
}

interface WeekAgenda {
  label: string;
  num: number;
  /** ISO da segunda-feira da grade; null quando a semana não tem nenhum encontro. */
  monday: string | null;
  byDay: Map<string, ActivityView[]>;
  dated: number;
  undated: ActivityView[];
}

function DayCell({
  iso,
  activities,
  onOpen,
}: {
  iso: string;
  activities: ActivityView[];
  onOpen: (a: ActivityView) => void;
}) {
  const parts = dayParts(iso);
  if (!parts) return null;

  return (
    <div
      className={cn(
        "flex min-h-24 flex-col gap-1 border-l border-t border-line-soft p-1.5 first:border-l-0",
        parts.isPast && !parts.isToday && "bg-bg/40",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center self-start rounded-full font-mono text-[0.68rem] tabular",
          parts.isToday ? "bg-accent font-medium text-white" : "text-fg-muted",
        )}
      >
        {parts.day}
      </span>

      {activities.map((a) => {
        const Icon = a.kind.icon;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpen(a)}
            title={a.caption}
            className="group flex w-full flex-col text-left"
          >
            {/* Card de trás: a matéria mora nele, e o da frente cobre o resto.
                Tingido com a cor do tipo — o fundo neutro do card da frente não
                serviria: contra o `surface` da célula os dois viravam uma faixa
                só.

                A conta da faixa: `pb-2.5` menos os `-mb-1.5` que o card da
                frente engole deixa 4px abaixo do texto, os mesmos 4px do `pt-1`
                acima dele. Mexer num sem mexer no outro descentraliza o nome. */}
            <span
              className="-mb-1.5 truncate rounded-t px-1.5 pb-2.5 pt-1 text-[0.58rem] font-medium leading-[1.15]"
              style={{
                color: a.kind.color,
                backgroundColor: `color-mix(in srgb, ${a.kind.color} 18%, transparent)`,
              }}
            >
              {subjectLabel(a)}
            </span>
            {/* `relative` garante a ordem de pintura: o da frente cobre o de
                trás mesmo quando a margem negativa os sobrepõe. */}
            <span
              className="relative flex items-start gap-1 rounded border-l-2 bg-surface-hover px-1.5 py-1 transition-colors duration-150 group-hover:bg-line-soft"
              style={{ borderLeftColor: a.kind.color }}
            >
              <Icon
                size={11}
                aria-hidden
                className="mt-[3px] shrink-0"
                style={{ color: a.kind.color }}
              />
              <span className="line-clamp-3 min-w-0 text-[0.65rem] leading-tight text-fg">
                {a.caption}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function UndatedList({
  activities,
  view,
  onOpen,
}: {
  activities: ActivityView[];
  view: SectionView;
  onOpen: (a: ActivityView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!activities.length) return null;

  const visible = expanded ? activities : activities.slice(0, UNDATED_CAP);
  const hidden = activities.length - visible.length;

  return (
    <div className="border-t border-line px-3 py-2.5">
      <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
        Autoestudos e entregas · {activities.length}
      </div>

      <ul className="mt-2 space-y-1">
        {visible.map((a) => {
          const Icon = a.kind.icon;
          return (
            <li key={a.id} className="group flex items-center gap-2">
              <Icon size={12} aria-hidden className="shrink-0" style={{ color: a.kind.color }} />
              {/* Título e peso andam juntos: com o badge empurrado para a borda
                  ele parecia pertencer a outra linha. */}
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(a)}
                  title={a.caption}
                  className="min-w-0 truncate text-left text-xs text-fg-soft transition-colors hover:text-fg"
                >
                  {a.caption}
                </button>
                {a.weight > 0 && (
                  <Badge color={CATEGORY_COLOR[a.category]} className="shrink-0">
                    {a.weight}
                  </Badge>
                )}
              </span>
              <div className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                <AskAiButtons activity={a} view={view} size="sm" />
              </div>
            </li>
          );
        })}
      </ul>

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[0.68rem] text-accent transition-opacity hover:opacity-80"
        >
          <ChevronDown
            size={12}
            aria-hidden
            className={cn("transition-transform duration-200", expanded && "rotate-180")}
          />
          {expanded ? "mostrar menos" : `mostrar mais ${hidden}`}
        </button>
      )}
    </div>
  );
}

function WeekRow({
  week,
  view,
  onOpen,
  onOpenWeek,
}: {
  week: WeekAgenda;
  view: SectionView;
  onOpen: (a: ActivityView) => void;
  onOpenWeek?: (week: string) => void;
}) {
  const days = week.monday ? Array.from({ length: 7 }, (_, i) => addDays(week.monday!, i)) : [];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 px-3 py-2.5">
        {/* O botão vai DENTRO do `h2`, e não o contrário: `<button>` não aceita
            um título como conteúdo, e assim o cabeçalho continua sendo
            cabeçalho para quem navega por eles. */}
        <CardTitle>
          {onOpenWeek ? (
            <button
              type="button"
              onClick={() => onOpenWeek(week.label)}
              title={`Abrir ${week.label} em Minhas atividades`}
              className="group inline-flex items-center gap-1 transition-colors duration-150 hover:text-fg focus-visible:text-fg focus-visible:outline-none"
            >
              {week.label}
              {/* A seta mora aqui em vez de aparecer no hover: um alvo clicável
                  que só se anuncia quando o mouse chega não é encontrado por
                  quem não passa o mouse ali. */}
              <ChevronRight
                size={11}
                aria-hidden
                className="transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </button>
          ) : (
            week.label
          )}
        </CardTitle>
        <span className="font-mono text-[0.62rem] text-fg-muted tabular">
          {week.dated} {week.dated === 1 ? "encontro" : "encontros"}
        </span>
      </div>

      {days.length > 0 && (
        <>
          <div className="grid grid-cols-7 border-t border-line bg-bg/40">
            {WEEKDAY_SHORT.map((label) => (
              <div
                key={label}
                className="border-l border-line-soft py-1 text-center text-[0.55rem] uppercase tracking-[0.08em] text-fg-muted first:border-l-0"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((iso) => (
              <DayCell
                key={iso}
                iso={iso}
                activities={week.byDay.get(dayKey(iso) ?? "") ?? []}
                onOpen={onOpen}
              />
            ))}
          </div>
        </>
      )}

      <UndatedList activities={week.undated} view={view} onOpen={onOpen} />
    </Card>
  );
}

export function Calendario({
  view,
  onOpen,
  onOpenWeek,
}: {
  view: SectionView;
  onOpen: (a: ActivityView) => void;
  /** Abre a semana no kanban. Ausente => o título da semana não é clicável. */
  onOpenWeek?: (week: string) => void;
}) {
  const weeks = useMemo<WeekAgenda[]>(() => {
    return view.weeks.map((week) => {
      const byDay = new Map<string, ActivityView[]>();
      const undated: ActivityView[] = [];
      let firstDate: string | null = null;
      let dated = 0;

      for (const activity of week.activities) {
        const key = dayKey(activity.date);
        if (!key || !activity.date) {
          undated.push(activity);
          continue;
        }
        dated += 1;
        if (!firstDate || activity.date < firstDate) firstDate = activity.date;
        const list = byDay.get(key);
        if (list) list.push(activity);
        else byDay.set(key, [activity]);
      }

      return {
        label: week.label,
        num: week.num,
        monday: firstDate ? startOfWeek(firstDate) : null,
        byDay,
        dated,
        undated: byCategory(undated),
      };
    });
  }, [view.weeks]);

  // UTC porque a grade toda trata data como calendário puro (ver comentário no
  // topo de lib/date) — comparar contra um "hoje" local desalinharia perto da
  // virada do dia.
  const todayKey = dayKey(new Date().toISOString());
  const currentWeekLabel = useMemo(() => {
    for (const week of weeks) {
      if (!week.monday) continue;
      for (let i = 0; i < 7; i++) {
        if (dayKey(addDays(week.monday, i)) === todayKey) return week.label;
      }
    }
    return null;
  }, [weeks, todayKey]);

  const currentWeekRef = useRef<HTMLDivElement>(null);

  // Roda a cada abertura da aba: o componente é montado/desmontado pela troca
  // de aba em Overview, então "no mount" já é exatamente "quando eu clico em
  // Calendário".
  useEffect(() => {
    currentWeekRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!weeks.length) {
    return (
      <Card className="p-6">
        <p className="text-sm text-fg-muted">Nenhuma atividade nesta turma.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">
        O Adalove só informa data para os encontros. Autoestudos e entregas aparecem listados na
        semana a que pertencem.
      </p>

      <div className="space-y-3">
        {weeks.map((week) => (
          <div
            key={week.label}
            ref={week.label === currentWeekLabel ? currentWeekRef : undefined}
            className="scroll-mt-6"
          >
            <WeekRow week={week} view={view} onOpen={onOpen} onOpenWeek={onOpenWeek} />
          </div>
        ))}
      </div>
    </div>
  );
}
