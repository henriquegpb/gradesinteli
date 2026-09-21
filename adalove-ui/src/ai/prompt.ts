import type { ActivityView, SectionView } from "~/data/viewmodel";

// Função pura: recebe atividade + contexto da turma, devolve o prompt. Sem
// React, sem DOM — dá pra testar e pra ajustar o texto sem tocar em UI.

const MAX_DESCRIPTION_CHARS = 1500;

/** Corta no fim de frase quando dá, para o enunciado não terminar no meio de uma
 *  palavra — a IA lê melhor e o aluno também, quando confere o prompt. */
export function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return `${lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : cut}… [trecho truncado]`;
}

/** Enquadramento por tipo — é o que faz a resposta ser útil em vez de genérica. */
function framing(activity: ActivityView): string {
  const { kind, category, isExam } = activity;

  if (isExam || category === "Prova") {
    return [
      "Me ajude a estudar para esta avaliação:",
      "1. Liste os tópicos que ela provavelmente cobra.",
      "2. Explique cada um de forma concisa.",
      "3. Crie 5 questões de revisão com gabarito comentado.",
    ].join("\n");
  }

  if (category === "Artefato" || category === "Ponderada" || kind.id === 21 || kind.id === 92) {
    const peso =
      activity.weight > 0
        ? `\nEssa atividade vale ${activity.weight} ponto(s) de peso na média do módulo.`
        : "";
    return [
      "Me ajude a entender e executar esta entrega:",
      "1. Destrinche o enunciado: o que exatamente está sendo pedido?",
      "2. Quais são os entregáveis concretos e os critérios prováveis de avaliação?",
      "3. Sugira um plano de ataque em passos, do começo ao fim.",
      "4. Aponte os erros mais comuns nesse tipo de entrega.",
      `5. O que costuma separar uma entrega nota máxima de uma mediana?${peso}`,
    ].join("\n");
  }

  if (kind.id === 11 || kind.id === 93 || kind.id === 22) {
    return [
      "Me ajude a estudar este material:",
      "1. Explique o conteúdo de forma clara, do zero.",
      "2. Resuma os pontos-chave em tópicos.",
      "3. Conecte com aplicações práticas na área.",
      "4. Crie 5 perguntas de fixação com respostas.",
    ].join("\n");
  }

  return [
    "Me ajude a me preparar para esta aula:",
    "1. Explique o tema e por que ele importa.",
    "2. O que eu deveria saber ANTES da aula?",
    "3. O que vale revisar DEPOIS para fixar?",
  ].join("\n");
}

export function buildPrompt(activity: ActivityView, view: SectionView): string {
  const context = [
    `Curso: ${view.section.type ?? "Graduação"} no Inteli${
      view.section.academicYear ? `, ${view.section.academicYear}º ano` : ""
    }`,
    `Turma: ${view.section.caption}`,
    `Semana: ${activity.week}`,
    `Tipo de atividade: ${activity.kind.name}`,
    activity.axis ? `Eixo: ${activity.axis}` : null,
    activity.professor ? `Professor: ${activity.professor}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const parts = [
    "Sou estudante do Inteli e preciso de ajuda com uma atividade da minha turma.",
    "",
    "## Contexto",
    context,
    "",
    `## Atividade: ${activity.caption}`,
  ];

  if (activity.descriptionText) {
    parts.push("", "### Enunciado", truncate(activity.descriptionText, MAX_DESCRIPTION_CHARS));
  }

  parts.push("", "## O que eu preciso", framing(activity));
  parts.push("", "Responda em português do Brasil.");

  return parts.join("\n");
}
