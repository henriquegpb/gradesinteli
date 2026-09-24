// Pedido de revisão de nota — a opção que o Adalove abriu no fim da aba de
// Avaliação do cartão.
//
// O contrato NÃO saiu de captura: as de `data/` são de 2026-08-11 e o recurso é
// posterior. Saiu do bundle deles (`assets/registry-89a13614.js`), o mesmo
// caminho que já tinha dado o `activityStudyAnswer` e o limite de 8000
// caracteres da resposta:
//
//   GET  /student-activity-grade-revisions/student-activity/{studentActivityUuid}
//        → { canRequest, deadlineAt, revision }
//   POST /student-activity-grade-revisions  { studentActivityUuid, reason }
//
// O GET responde para qualquer atividade — é o `deadlineAt` que diz se a nota
// já foi publicada. Prova não entra: lá a revisão é por questão, num endpoint
// próprio (`/student-activity-grade-revisions/exam/...`) e numa tela que a
// gente ainda não reconstruiu.

export type RevisionStatus = "pending" | "deferred" | "undeferred";

export interface Revision {
  uuid: string;
  status: RevisionStatus;
  /** A argumentação que o aluno enviou. Texto puro. */
  reason: string;
  requestedAt: string;
  /** Quando o professor decidiu. null enquanto está em análise. */
  decidedAt: string | null;
  /** Resposta do professor. Vem como o feedback: HTML, ou LaTeX em texto. */
  professorResponse: string | null;
  /** Nota que valia antes do pedido — é o que dá para comparar depois do
   *  deferimento, já que o `/userdata` só traz a nota corrente. */
  gradeResultPrevious: number;
}

export interface RevisionState {
  /** false depois do prazo, e depois do único pedido que cada atividade tem. */
  canRequest: boolean;
  /** Fim do prazo, ISO SEM fuso (hora de parede). null quando a nota ainda não
   *  foi publicada — e aí não há nada a mostrar. */
  deadlineAt: string | null;
  revision: Revision | null;
}

/** Limite do campo de argumentação, do bundle deles. Maior que o da resposta da
 *  atividade (8000), que é outro campo e outro endpoint. */
export const REVISION_MAX_CHARS = 10_000;

/** O prazo por extenso. É regra do Adalove, não conta nossa: eles também
 *  escrevem a janela na frase e só o `deadlineAt` vem calculado. */
export const REVISION_WINDOW = "3 dias úteis";

/** Os mesmos três rótulos do Adalove, nas tonalidades equivalentes daqui
 *  (warning/success/error → warning/positive/negative). */
export const REVISION_STATUS: Record<
  RevisionStatus,
  { label: string; tone: "warning" | "positive" | "negative" }
> = {
  pending: { label: "Em análise", tone: "warning" },
  deferred: { label: "Deferido", tone: "positive" },
  undeferred: { label: "Indeferido", tone: "negative" },
};

export const REVISIONS_PATH = "/student-activity-grade-revisions";

export function revisionPath(studentActivityUuid: string): string {
  return `${REVISIONS_PATH}/student-activity/${studentActivityUuid}`;
}
