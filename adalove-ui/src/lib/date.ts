// O `date` das atividades vem como ISO com hora nominal em UTC
// ("2026-08-03T07:00:00.000Z"). Essa hora NÃO é o horário da aula — os horários
// reais estão em `sectionAttendanceTime*` (07:52 / 10:00 / 12:00). Converter
// para o fuso local produziria "04:00", que não existe na grade.
//
// Por isso tudo aqui lê os componentes em UTC e trata o campo como data pura.

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "03/08/2026" */
export function formatDate(iso: string | null): string | null {
  const d = parse(iso);
  if (!d) return null;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

// Os prazos do pedido de revisão chegam SEM fuso ("2026-09-28T23:59:00") e são
// hora de parede: o front do Adalove lê os campos do próprio texto, sem
// converter. Passar por `new Date()` os leria como horário local e, na volta,
// `getUTCHours()` somaria três horas — 23:59 do dia 28 viraria 02:59 do dia 29,
// e o prazo mudaria de dia bem na hora em que isso mais importa.

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;

/** "28/09/2026 - 23:59h" */
export function formatNaiveDateTime(iso: string | null): string | null {
  const m = iso ? NAIVE.exec(iso) : null;
  if (!m?.[4]) return formatNaiveDate(iso);
  return `${m[3]}/${m[2]}/${m[1]} - ${m[4]}:${m[5]}h`;
}

/** "28/09/2026" */
export function formatNaiveDate(iso: string | null): string | null {
  const m = iso ? NAIVE.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Chave de agrupamento por dia: "2026-08-03" */
export function dayKey(iso: string | null): string | null {
  const d = parse(iso);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Segunda-feira da semana que contém `iso`, em UTC. A grade começa na segunda
 *  porque os encontros do Inteli são de segunda a sexta — assim os cinco dias
 *  letivos ficam nas primeiras colunas e o fim de semana vira uma cauda quieta. */
export function startOfWeek(iso: string): string | null {
  const d = parse(iso);
  if (!d) return null;
  const offset = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset),
  ).toISOString();
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days),
  ).toISOString();
}

export const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export interface DayParts {
  day: string;
  month: string;
  weekday: string;
  isToday: boolean;
  isPast: boolean;
}

export function dayParts(iso: string | null, now = new Date()): DayParts | null {
  const d = parse(iso);
  if (!d) return null;

  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const thisKey = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  const endOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59);

  return {
    day: String(d.getUTCDate()).padStart(2, "0"),
    month: MONTHS[d.getUTCMonth()] ?? "",
    weekday: WEEKDAYS[d.getUTCDay()] ?? "",
    isToday: todayKey === thisKey,
    isPast: endOfDay < now.getTime(),
  };
}
