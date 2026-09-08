import { STATUS_DONE } from "~/data/types";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { startOfWeek } from "~/lib/date";

// Onde o módulo está NO TEMPO — a régua de semanas do topo e a fila do que ainda
// vem. As duas perguntas dependem da mesma âncora (que semana é hoje), por isso
// moram juntas em vez de cada componente refazer a conta.

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Semana atual = quantas semanas se passaram desde a segunda da Semana 01.
 *
 *  Uma data conhecida basta para ancorar a régua, porque as semanas do Adalove
 *  são consecutivas e numeradas: da semana ancorada volta-se `num - 1` semanas
 *  para achar a origem. Assim uma semana sem encontro (recesso, semana só de
 *  autoestudo) não deixa buraco na conta.
 *
 *  `now` entra como data pura em UTC, igual ao resto de lib/date.ts: as datas do
 *  /userdata são meia-noite UTC, e comparar com o horário local faria a semana
 *  virar algumas horas adiantada. */
export function currentWeek(view: SectionView, now: Date): { week: number; total: number } | null {
  const total = view.weeks.length;
  if (total === 0) return null;

  let origin: number | null = null;
  for (const w of view.weeks) {
    const first = w.activities
      .map((a) => a.date)
      .filter((d): d is string => !!d)
      .sort()[0];
    const monday = first ? startOfWeek(first) : null;
    if (monday) {
      origin = Date.parse(monday) - (w.num - 1) * WEEK;
      break;
    }
  }
  if (origin === null) return null;

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsed = Math.floor((today - origin) / WEEK) + 1;
  return { week: Math.min(Math.max(elapsed, 1), total), total };
}

export interface NextScored {
  /** As próximas, na ordem em que caem — no máximo o `count` pedido. */
  items: ActivityView[];
  /** Quantas ainda vêm depois destas. É o que autoriza a régua a continuar
   *  desbotando para a direita em vez de terminar no último ponto. */
  rest: number;
}

/** A fila das atividades com pontuação que ainda estão de pé.
 *
 *  A ordem NÃO pode sair da data: só encontro tem `date` no /userdata — ponderada
 *  e artefato vêm sempre com data nula. O que sobra é a posição no kanban
 *  (semana, depois `sort`), que é justamente a ordem em que o Adalove as
 *  apresenta; `view.activities` já chega assim de `buildSectionView`.
 *
 *  A fila começa na semana corrente. Atrasada de semana passada fica de fora
 *  enquanto houver o que vem pela frente — a régua responde "o que vem agora", e
 *  uma pendência de três semanas atrás empurraria para fora justamente o que
 *  ainda dá para fazer. Quando não há mais nada à frente (fim do módulo), as
 *  atrasadas voltam: aí elas SÃO o que resta. */
export function nextScored(view: SectionView, now: Date, count: number): NextScored {
  const pending = view.activities.filter(
    (a) => a.weight > 0 && a.grade === null && !a.evaluated && a.status !== STATUS_DONE,
  );

  const week = currentWeek(view, now)?.week ?? 0;
  const ahead = pending.filter((a) => a.weekNum >= week);
  const queue = ahead.length > 0 ? ahead : pending;

  return { items: queue.slice(0, count), rest: Math.max(queue.length - count, 0) };
}

export interface TimelineEntry {
  activity: ActivityView;
  /** Semana já vencida ou nota já lançada. É o que separa os dois lados da
   *  linha do tempo: à esquerda o que ficou para trás (esmaecido e com a nota),
   *  à direita o que ainda vem. */
  past: boolean;
}

/** O módulo inteiro em ordem, com pontuação — o que a régua do cabeçalho mostra
 *  em três, aqui aparece do começo ao fim.
 *
 *  Uma semana vencida entra no passado mesmo sem nota: atraso do professor não
 *  faz a entrega voltar a ser futuro. E nota lançada antes da hora também: a
 *  atividade acabou, independente de que semana o calendário diz que é. */
export function scoredTimeline(view: SectionView, now: Date): TimelineEntry[] {
  const week = currentWeek(view, now)?.week ?? 0;
  return view.activities
    .filter((a) => a.weight > 0)
    .map((a) => ({ activity: a, past: a.weekNum < week || a.grade !== null }));
}
