import { truncate } from "~/ai/prompt";
import type { ActivityView, SectionView } from "~/data/viewmodel";

// "Matéria" não existe como campo no /userdata. O que existe é professor, eixo
// e o prefixo do título — e cada professor leciona uma disciplina. Então
// agrupamos por professor e derivamos o nome da matéria do prefixo mais comum
// dos títulos dele ("(NLP Aula 3) …" → NLP), caindo para o eixo quando não há
// prefixo (é o caso de NEG e LID) e para o primeiro nome em último caso.

export interface Subject {
  id: string;
  label: string;
  professor: string | null;
  axis: string | null;
  activities: ActivityView[];
}

function derivedLabel(activities: ActivityView[], professor: string): string {
  const prefixes = new Map<string, number>();
  for (const a of activities) {
    const m = /^\(([A-Za-zÀ-ú]{2,12})[\s-]/.exec(a.caption);
    if (m?.[1]) prefixes.set(m[1], (prefixes.get(m[1]) ?? 0) + 1);
  }
  const top = [...prefixes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) return top[0];

  const axes = [...new Set(activities.map((a) => a.axis).filter(Boolean))];
  if (axes.length === 1 && axes[0]) return axes[0];

  return professor.trim().split(/\s+/)[0] ?? professor;
}

export function buildSubjects(view: SectionView): Subject[] {
  const byProfessor = new Map<string, ActivityView[]>();
  for (const a of view.activities) {
    if (!a.professor) continue;
    const list = byProfessor.get(a.professor);
    if (list) list.push(a);
    else byProfessor.set(a.professor, [a]);
  }

  return [...byProfessor.entries()]
    .map(([professor, activities]) => ({
      id: professor,
      label: derivedLabel(activities, professor),
      professor,
      axis: [...new Set(activities.map((a) => a.axis).filter(Boolean))].join("/") || null,
      activities,
    }))
    .filter((s) => s.activities.length >= 3)
    .sort((a, b) => b.activities.length - a.activities.length);
}

// ---------------------------------------------------------------------------
// Sprints
//
// Sprint não existe no /userdata: o kanban do Adalove é por semana. Mas o
// projeto do módulo é entregue por sprint, e sprint são DUAS semanas — 1–2 é a
// Sprint 1, 9–10 é a Sprint 5. Os artefatos caem na semana par, o fechamento de
// cada uma, e é por isso que este é o corte que explica o projeto: por semana,
// metade das sprints parece não ter entrega nenhuma.
// ---------------------------------------------------------------------------

const SPRINT_WEEKS = 2;

export interface Sprint {
  id: string;
  num: number;
  label: string;
  /** "Semanas 07–08", para a pessoa reconhecer de que parte do módulo se fala. */
  weeksLabel: string;
  activities: ActivityView[];
  artifacts: ActivityView[];
}

export function buildSprints(view: SectionView): Sprint[] {
  const byNum = new Map<number, ActivityView[]>();
  for (const a of view.activities) {
    // `weekNum` 0 é "Sem semana" (atividade sem pasta): não pertence a sprint
    // nenhuma, e arredondar a colocaria numa Sprint 0 inexistente.
    if (a.weekNum < 1) continue;
    const num = Math.ceil(a.weekNum / SPRINT_WEEKS);
    const list = byNum.get(num);
    if (list) list.push(a);
    else byNum.set(num, [a]);
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return [...byNum.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, activities]) => {
      const weeks = [...new Set(activities.map((a) => a.weekNum))].sort((x, y) => x - y);
      const first = weeks[0] ?? num * SPRINT_WEEKS - 1;
      const last = weeks[weeks.length - 1] ?? first;
      return {
        id: `sprint-${num}`,
        num,
        label: `Sprint ${num}`,
        weeksLabel: first === last ? `Semana ${pad(first)}` : `Semanas ${pad(first)}–${pad(last)}`,
        activities,
        artifacts: activities.filter((a) => a.category === "Artefato"),
      };
    });
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export type SummaryScope =
  | { kind: "module" }
  | { kind: "subject"; subject: Subject }
  | { kind: "sprint"; sprint: Sprint };

/** Só títulos, agrupados por semana: com descrições o prompt do módulo passaria
 *  de 100k. O escopo de sprint é a exceção — lá cabem os enunciados dos
 *  artefatos, que são três ou quatro. */
const MAX_ACTIVITIES = 160;
const MAX_ARTIFACT_CHARS = 700;

/** Uma sprint traz ~50 atividades de apoio, e a cauda é vídeo de estudo: listar
 *  todas empurra o prompt para longe do teto de URL sem ajudar a explicar a
 *  etapa do projeto. O corte vem depois da ordenação por relevância, então o que
 *  se perde é sempre a cauda. */
const MAX_SUPPORT = 30;

/** Como a resposta deve SER, separado do que ela deve conter. As duas últimas
 *  regras existem porque são os dois jeitos de a resposta virar lixo: devolver a
 *  lista de atividades parafraseada, ou inventar conteúdo de aula que o título
 *  não revela. */
const RESPONSE_RULES = [
  "## Como responder",
  "- Português do Brasil.",
  "- Seja conciso: explicação curta e concreta vale mais que texto longo. Sem introdução nem fechamento cerimonioso.",
  "- Não me devolva a lista de atividades reescrita — ela é fonte, não resposta.",
  "- Onde o material não disser o suficiente, diga o que falta em vez de preencher com genérico.",
].join("\n");

function contextLines(view: SectionView): string[] {
  return [
    `Curso: ${view.section.type ?? "Graduação"} no Inteli${
      view.section.academicYear ? `, ${view.section.academicYear}º ano` : ""
    }`,
    `Turma: ${view.section.caption}`,
    view.section.projectDescription ? `Projeto do módulo: ${view.section.projectDescription}` : "",
  ].filter(Boolean);
}

/** Atividades por semana, em tópicos — a ordem cronológica é a informação. */
function byWeekOutline(activities: ActivityView[]): string {
  const byWeek = new Map<string, ActivityView[]>();
  for (const a of activities) {
    const list = byWeek.get(a.week);
    if (list) list.push(a);
    else byWeek.set(a.week, [a]);
  }

  return [...byWeek.entries()]
    .sort((a, b) => (a[1][0]?.weekNum ?? 0) - (b[1][0]?.weekNum ?? 0))
    .map(([week, list]) => `${week}\n${list.map((a) => `  - ${a.caption}`).join("\n")}`)
    .join("\n\n");
}

/** A trilha inteira do projeto, uma linha por sprint com os artefatos que ela
 *  fecha. É o que permite responder "como esta etapa se encaixa nas outras" —
 *  sem isto a IA só vê a sprint pedida e tem que chutar o antes e o depois. */
function projectTrack(sprints: Sprint[], currentNum: number): string {
  return sprints
    .map((s) => {
      const marker = s.num === currentNum ? "»" : " ";
      const artifacts = s.artifacts.length
        ? s.artifacts.map((a) => a.caption).join("; ")
        : "sem artefato (sprint de desenvolvimento)";
      return `${marker} ${s.label} (${s.weeksLabel}): ${artifacts}`;
    })
    .join("\n");
}

function sprintPrompt(view: SectionView, sprint: Sprint): string {
  const sprints = buildSprints(view);
  const previous = sprints.some((s) => s.num < sprint.num);
  const next = sprints.some((s) => s.num > sprint.num);

  const artifacts = sprint.artifacts.length
    ? sprint.artifacts
        .map((a) => {
          const peso = a.weight > 0 ? ` — vale ${a.weight} ponto(s) na média do módulo` : "";
          const enunciado = a.descriptionText
            ? `\n${truncate(a.descriptionText, MAX_ARTIFACT_CHARS)}`
            : "\n(sem enunciado no Adalove)";
          return `### ${a.caption}${peso}${enunciado}`;
        })
        .join("\n\n")
    : "Esta sprint não tem artefato próprio: ela alimenta a entrega da seguinte.";

  // Encontro primeiro, depois o que vale nota, e o material de estudo no fim.
  // `sort` é estável, então dentro de cada faixa a ordem cronológica se mantém.
  const support = sprint.activities
    .filter((a) => a.category !== "Artefato")
    .map((a) => ({ a, rank: a.kind.id === 1 || a.kind.id === 2 ? 0 : a.weight > 0 ? 1 : 2 }))
    .sort((x, y) => x.rank - y.rank)
    .map(({ a }) => `  - ${a.caption}${a.weight > 0 ? ` (${a.weight} ponto(s))` : ""}`);

  const supportShown = support.slice(0, MAX_SUPPORT);
  const supportRest = support.length - supportShown.length;

  return [
    `Sou estudante do Inteli. Quero entender a ${sprint.label} do meu módulo (${sprint.weeksLabel}): que etapa do projeto ela é, o que os artefatos dela pedem e como ela se encaixa nas outras sprints.`,
    "",
    "## Contexto",
    ...contextLines(view),
    "",
    "## Trilha do projeto",
    "O módulo é entregue em sprints de duas semanas, cada uma fechando com artefatos. A marcada com » é a que eu quero entender:",
    "",
    projectTrack(sprints, sprint.num),
    "",
    `## Artefatos da ${sprint.label}`,
    artifacts,
    "",
    support.length
      ? [
          `## Aulas e autoestudos da sprint (${support.length}) — o que sustenta a entrega`,
          supportShown.join("\n"),
          supportRest > 0 ? `  … e mais ${supportRest} itens de estudo.` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    "",
    "## O que eu preciso",
    "Foque nos artefatos: as aulas entram como o que sustenta a entrega, não como assunto próprio.",
    `1. Que etapa do projeto é a ${sprint.label}, em duas ou três frases — o que existe no fim dela que não existia antes.`,
    "2. O que cada artefato pede em concreto, e o que eu preciso ter entendido para conseguir fazer.",
    previous
      ? "3. O que esta sprint consome das anteriores: em cima de que ela é construída."
      : "3. Como esta sprint estabelece a base do projeto — ela é a primeira, então diga o que precisa sair certo daqui.",
    next
      ? "4. O que ela prepara para as sprints seguintes: o que trava lá se sair mal aqui."
      : "4. Como ela fecha o projeto: o que o conjunto das sprints anteriores tem que sustentar na entrega final.",
    "5. Onde essa etapa costuma dar errado, e como eu percebo que o artefato está bom antes de entregar.",
    "",
    RESPONSE_RULES,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildSummaryPrompt(view: SectionView, scope: SummaryScope): string {
  if (scope.kind === "sprint") return sprintPrompt(view, scope.sprint);

  const subject = scope.kind === "subject" ? scope.subject : null;
  const activities = (subject?.activities ?? view.activities)
    .filter((a) => a.caption)
    .slice(0, MAX_ACTIVITIES);

  // A preposição entra aqui contraída: com `de ${escopo}` o texto saía
  // "resumo de estudos de a matéria de MAT".
  const escopo = subject
    ? `a matéria de ${subject.label}${subject.professor ? ` (prof. ${subject.professor})` : ""}`
    : "o módulo inteiro";

  return [
    `Sou estudante do Inteli e quero entender ${escopo} de forma concisa, para estudar.`,
    "",
    "## Contexto",
    ...contextLines(view),
    subject?.axis ? `Eixo: ${subject.axis}` : "",
    "",
    `## Atividades (${activities.length}), na ordem em que aconteceram`,
    byWeekOutline(activities),
    "",
    "## O que eu preciso",
    "1. O que este conjunto ensina, na ordem em que faz sentido estudar — não na ordem do calendário, se ela não for a melhor.",
    "2. Os conceitos centrais: o que é, para que serve e quando se usa. Curto, um parágrafo cada.",
    subject
      ? "3. Como os temas se conectam entre si e onde esta matéria entra no projeto do módulo."
      : "3. Como as matérias se conectam entre si e como cada uma sustenta o projeto do módulo.",
    "4. O que costuma ser cobrado em avaliação e onde as pessoas erram.",
    "5. Um plano de revisão em passos, do que não sei nada até dar conta do módulo.",
    "",
    RESPONSE_RULES,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
