// Aba de Organização do cartão: tags, tarefas e anotações — as três coisas que
// o aluno escreve para si mesmo.
//
// Contrato extraído do bundle deles (`assets/registry-89a13614.js`), como o do
// pedido de revisão. São dois mecanismos diferentes:
//
//   tags e anotações   PUT /student-activities/{uuid}/autosave
//                      { activityTags: "a,b,c" } | { activityNotes: "…" }
//
//   tarefas            GET    (vêm em `tasks` no /student-activities/{uuid}/activity/data)
//                      POST   /student-activity-tasks/student-activity/{uuid}   { caption }
//                      PUT    /student-activity-tasks/{task}/student-activity/{uuid}/status  { status }
//                      DELETE /student-activity-tasks/{task}/student-activity/{uuid}
//
// As tarefas não estão no /userdata: só o endpoint de detalhe as traz, e é o
// mesmo que o modal já chama ao abrir — então a lista chega sem requisição
// nova.

export interface Task {
  studentActivityTaskUuid: string;
  caption: string;
  /** 0 = a fazer, 1 = feita. */
  status: number;
}

export const TASK_TODO = 0;
export const TASK_DONE = 1;

/** Limites do `maxLength` de cada campo na UI original. A API provavelmente
 *  aceita mais, mas passar deles é escrever algo que o Adalove não deixaria — e
 *  que ninguém conseguiria editar de volta por lá. */
export const TAG_MAX_CHARS = 25;
export const TASK_MAX_CHARS = 500;
export const NOTES_MAX_CHARS = 1000;

/** As tags moram num campo de texto só, separadas por vírgula — por isso vírgula
 *  não pode entrar no nome de uma tag: ela viraria duas na próxima leitura. */
export function parseTags(csv: string | null): string[] {
  return (csv ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function joinTags(tags: string[]): string {
  return tags.join(",");
}

export function tasksPath(studentActivityUuid: string): string {
  return `/student-activity-tasks/student-activity/${studentActivityUuid}`;
}

export function taskPath(taskUuid: string, studentActivityUuid: string): string {
  return `/student-activity-tasks/${taskUuid}/student-activity/${studentActivityUuid}`;
}
