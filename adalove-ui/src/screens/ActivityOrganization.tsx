import { Check, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApiClient } from "~/data/api";
import type { ActivityFields } from "~/data/client";
import {
  NOTES_MAX_CHARS,
  TAG_MAX_CHARS,
  TASK_DONE,
  TASK_MAX_CHARS,
  TASK_TODO,
  joinTags,
  taskPath,
  tasksPath,
  type Task,
} from "~/data/organization";
import type { ActivityView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { Badge } from "~/ui/Badge";
import { Button, IconButton } from "~/ui/Button";
import { Input } from "~/ui/Input";
import { useToast } from "~/ui/Toast";

// A aba de Organização é a única do cartão inteiramente do aluno: nada aqui vem
// do professor. Eram três campos só de leitura; agora escrevem, como no Adalove.
//
// As três coisas gravam por caminhos diferentes (ver `~/data/organization`):
// tags e anotações pelo autosave do cartão, tarefas por um endpoint próprio.

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Tags.
 *
 *  Escrevem no mesmo campo de texto, separadas por vírgula — por isso a vírgula
 *  é filtrada da digitação em vez de recusada com aviso: quem digita "algoritmos,
 *  grafos" quer duas tags, e o Adalove salvaria isso como uma tag só com
 *  vírgula no meio, que na releitura vira duas mesmo assim. Melhor cortar antes
 *  e deixar a pessoa criar a segunda. */
function Tags({
  activity,
  onSave,
}: {
  activity: ActivityView;
  onSave: (fields: ActivityFields) => Promise<unknown>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function write(tags: string[], falha: string) {
    setBusy(true);
    try {
      await onSave({ activityTags: joinTags(tags) });
    } catch (error) {
      toast.error(error instanceof Error ? `${falha}: ${error.message}` : falha);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const tag = draft.trim();
    setDraft("");
    setAdding(false);
    // Repetida não entra: o campo é uma lista, e duas iguais só ocupariam espaço
    // — e apagar uma delas apagaria pelo índice, o que confundiria de vez.
    if (!tag || activity.tags.includes(tag)) return;
    await write([...activity.tags, tag], "Não foi possível criar a tag");
  }

  return (
    <Section title="Tags">
      <div className="flex flex-wrap items-center gap-1.5">
        {activity.tags.map((tag, i) => (
          <Badge key={`${tag}-${i}`} className="gap-1.5 pr-1">
            {tag}
            <button
              type="button"
              aria-label={`Remover a tag ${tag}`}
              disabled={busy}
              onClick={() =>
                void write(
                  activity.tags.filter((_, j) => j !== i),
                  "Não foi possível remover a tag",
                )
              }
              className="rounded-full p-0.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-red disabled:opacity-50"
            >
              <X size={10} aria-hidden />
            </button>
          </Badge>
        ))}

        {adding ? (
          <Input
            ref={inputRef}
            value={draft}
            maxLength={TAG_MAX_CHARS}
            placeholder="Nome da tag"
            aria-label="Nome da nova tag"
            onChange={(e) => setDraft(e.target.value.replace(/,/g, ""))}
            // Blur confirma em vez de descartar: o Adalove deixa o campo aberto
            // para sempre nesse caso, e perder o que já foi digitado seria pior
            // que criar a tag que a pessoa acabou de escrever. Escape descarta.
            onBlur={() => void add()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            className="h-6 w-36 px-2 text-xs"
          />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[0.6rem] font-medium text-fg-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <Plus size={10} aria-hidden />
            Nova tag
          </button>
        )}
      </div>
    </Section>
  );
}

/** Tarefas: a checklist do cartão.
 *
 *  Estado local, e não `raw`: as tarefas não vêm no /userdata — chegam no
 *  endpoint de detalhe, que é por cartão. Por isso são as únicas escritas da
 *  aba que falam com a API direto, sem passar pelo App. */
function Tasks({ activity, initial }: { activity: ActivityView; initial: Task[] }) {
  const client = useApiClient();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // A lista chega depois do modal abrir (o detalhe é assíncrono) e muda ao
  // trocar de cartão.
  useEffect(() => setTasks(initial), [initial]);

  const writable = !!client?.post && !!client.put && !!client.delete;

  function fail(error: unknown, what: string) {
    toast.error(error instanceof Error ? `${what}: ${error.message}` : what);
  }

  async function add() {
    const caption = draft.trim();
    if (!caption || !client?.post) return;
    setBusy(true);
    try {
      // O uuid vem da resposta do POST; sem ele não dá para marcar nem apagar a
      // tarefa recém-criada antes de reabrir o cartão.
      const created = (await client.post(tasksPath(activity.id), { caption })) as {
        uuid?: string;
      } | null;
      if (!created?.uuid) throw new Error("o Adalove não devolveu o identificador da tarefa");
      setTasks((current) => [
        ...current,
        { studentActivityTaskUuid: created.uuid!, caption, status: TASK_TODO },
      ]);
      setDraft("");
    } catch (error) {
      fail(error, "Não foi possível criar a tarefa");
    } finally {
      setBusy(false);
    }
  }

  /** Marcar é otimista: o risco é um clique errado, o conserto é outro clique, e
   *  esperar a rede para o visto aparecer faria a lista parecer travada. */
  async function toggle(task: Task) {
    if (!client?.put) return;
    const status = task.status === TASK_DONE ? TASK_TODO : TASK_DONE;
    const swap = (to: number) =>
      setTasks((current) =>
        current.map((t) =>
          t.studentActivityTaskUuid === task.studentActivityTaskUuid ? { ...t, status: to } : t,
        ),
      );

    swap(status);
    try {
      await client.put(`${taskPath(task.studentActivityTaskUuid, activity.id)}/status`, {
        status,
      });
    } catch (error) {
      swap(task.status);
      fail(error, "Não foi possível marcar a tarefa");
    }
  }

  /** Apagar NÃO é otimista: tirar a linha antes da confirmação e trazê-la de
   *  volta no erro é pior do que ela sumir meio segundo depois. */
  async function remove(task: Task) {
    if (!client?.delete) return;
    setBusy(true);
    try {
      await client.delete(taskPath(task.studentActivityTaskUuid, activity.id));
      setTasks((current) =>
        current.filter((t) => t.studentActivityTaskUuid !== task.studentActivityTaskUuid),
      );
    } catch (error) {
      fail(error, "Não foi possível apagar a tarefa");
    } finally {
      setBusy(false);
    }
  }

  const done = tasks.filter((t) => t.status === TASK_DONE).length;

  return (
    <Section title={tasks.length ? `Tarefas · ${done}/${tasks.length}` : "Tarefas"}>
      {writable && (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            maxLength={TASK_MAX_CHARS}
            placeholder="Sua tarefa"
            aria-label="Nova tarefa"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              void add();
            }}
          />
          <Button variant="primary" disabled={!draft.trim() || busy} onClick={() => void add()}>
            Adicionar
          </Button>
        </div>
      )}

      {tasks.length > 0 && (
        <ul className={cn("space-y-1", writable && "mt-2")}>
          {tasks.map((task) => {
            const checked = task.status === TASK_DONE;
            return (
              <li
                key={task.studentActivityTaskUuid}
                className="group flex items-start gap-2 rounded-control px-1 py-1 transition-colors hover:bg-surface-hover"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={task.caption}
                  disabled={!writable}
                  onClick={() => void toggle(task)}
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    checked ? "border-accent bg-accent text-white" : "border-line bg-bg",
                    writable ? "cursor-pointer hover:border-accent" : "cursor-default",
                  )}
                >
                  {checked && <Check size={11} strokeWidth={3} aria-hidden />}
                </button>

                <span
                  className={cn(
                    "min-w-0 flex-1 break-words text-sm",
                    checked ? "text-fg-muted line-through" : "text-fg-soft",
                  )}
                >
                  {task.caption}
                </span>

                {writable && (
                  <IconButton
                    aria-label={`Apagar a tarefa ${task.caption}`}
                    disabled={busy}
                    onClick={() => void remove(task)}
                    // Some até o ponteiro chegar: são 3 botões de lixeira por
                    // cartão, e vermelho permanente puxa o olho para a ação
                    // destrutiva em vez de para a lista.
                    className="size-7 shrink-0 border-transparent bg-transparent opacity-0 transition-opacity hover:text-red focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} aria-hidden />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!tasks.length && !writable && (
        <p className="text-sm text-fg-muted">Você não criou tarefas nesta atividade.</p>
      )}
    </Section>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Anotações.
 *
 *  Salva no blur, como o Adalove — e não com debounce como a resposta. A
 *  diferença é o tamanho: a resposta é um texto longo, em que perder o último
 *  parágrafo por fechar o modal cedo dói; a anotação cabe em três linhas, e
 *  salvar a cada 1,5s daria um PUT por frase. O desmonte também grava, então
 *  fechar o cartão com o cursor no campo não perde nada. */
function Notes({
  activity,
  onSave,
}: {
  activity: ActivityView;
  onSave: (fields: ActivityFields) => Promise<unknown>;
}) {
  const saved = activity.notes ?? "";
  const [value, setValue] = useState(saved);
  const [state, setState] = useState<SaveState>("idle");
  const toast = useToast();

  // Só ao trocar de cartão: reagir a `saved` jogaria o cursor para o fim quando
  // o valor gravado voltasse do App.
  useEffect(() => {
    setValue(activity.notes ?? "");
    setState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id]);

  const savedRef = useRef(saved);
  savedRef.current = saved;
  const valueRef = useRef(value);
  valueRef.current = value;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  async function flush() {
    const text = valueRef.current;
    if (text === savedRef.current) return;
    setState("saving");
    try {
      await onSaveRef.current({ activityNotes: text });
      setState("saved");
    } catch (error) {
      setState("error");
      toast.error(
        error instanceof Error
          ? `Não foi possível salvar a anotação: ${error.message}`
          : "Não foi possível salvar a anotação.",
      );
    }
  }

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    return () => {
      void flushRef.current();
    };
  }, [activity.id]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
          Minhas anotações
        </div>
        <span
          aria-live="polite"
          className={cn("text-[0.58rem] tabular", state === "error" ? "text-red" : "text-fg-muted")}
        >
          {state === "saving" && "Salvando…"}
          {state === "saved" && "Salvo"}
          {state === "error" && "Não salvo"}
        </span>
      </div>

      <textarea
        rows={4}
        value={value}
        maxLength={NOTES_MAX_CHARS}
        placeholder="O que você quer lembrar sobre esta atividade…"
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        onBlur={() => void flush()}
        // Mesmo cinto e suspensório do editor de resposta: o body do Adalove usa
        // `user-select:none` e a herança atravessa o shadow root.
        style={{ userSelect: "text", WebkitUserSelect: "text" }}
        className={cn(
          "mt-2 block w-full resize-y rounded-control border border-line bg-bg px-3 py-2 text-sm leading-relaxed text-fg outline-none transition-colors duration-150",
          "placeholder:text-fg-muted focus:border-accent",
        )}
      />
    </div>
  );
}

/** Conteúdo da aba de Organização. Sem `onSave` (harness sem escrita, ou cartão
 *  de outra pessoa) tudo continua aparecendo, só que de leitura. */
export function ActivityOrganization({
  activity,
  tasks,
  onSave,
}: {
  activity: ActivityView;
  tasks: Task[];
  onSave?: (fields: ActivityFields) => Promise<unknown>;
}) {
  return (
    <div className="space-y-4">
      {onSave ? (
        <Tags activity={activity} onSave={onSave} />
      ) : (
        activity.tags.length > 0 && (
          <Section title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {activity.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </Section>
        )
      )}

      <Tasks activity={activity} initial={tasks} />

      {onSave ? (
        <Notes activity={activity} onSave={onSave} />
      ) : (
        <Section title="Minhas anotações">
          {activity.notes ? (
            <p className="whitespace-pre-wrap text-sm text-fg-soft">{activity.notes}</p>
          ) : (
            <p className="text-sm text-fg-muted">Você não escreveu anotações nesta atividade.</p>
          )}
        </Section>
      )}
    </div>
  );
}
