import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fmtNota } from "@/lib/format";
import { useApiClient } from "~/data/api";
import {
  REVISION_MAX_CHARS,
  REVISION_STATUS,
  REVISION_WINDOW,
  REVISIONS_PATH,
  revisionPath,
  type Revision,
  type RevisionState,
} from "~/data/gradeRevision";
import type { ActivityView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { formatNaiveDate, formatNaiveDateTime } from "~/lib/date";
import { Badge } from "~/ui/Badge";
import { Button } from "~/ui/Button";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { Html } from "~/ui/Html";
import { useToast } from "~/ui/Toast";

/** Não havia checkbox no kit: até aqui nenhuma tela precisou de uma — os filtros
 *  usam `Switch`, que é preferência, e preferência liga e desliga. Aqui o gesto
 *  é o do Adalove, marcar para abrir o formulário, e um interruptor daria a
 *  impressão de já ter ativado alguma coisa antes de a pessoa escrever nada. */
function Checkbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          checked ? "border-accent bg-accent text-white" : "border-line bg-bg",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent",
        )}
      >
        {checked && <Check size={11} strokeWidth={3} aria-hidden />}
      </button>
      <span className={cn("text-sm", disabled ? "text-fg-muted" : "text-fg-soft")}>{label}</span>
    </label>
  );
}

function Box({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-card border border-line bg-bg p-3">
      <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">{title}</div>
      <div className="mt-1">
        <Html html={children} />
      </div>
    </div>
  );
}

const ONCE = "Você já usou seu único pedido de revisão desta atividade.";

/** Rótulo da caixa, sem a data quando ela não veio. Sem isto o cabeçalho sairia
 *  "Sua argumentação · null". */
function titled(label: string, iso: string | null): string {
  const date = formatNaiveDate(iso);
  return date ? `${label} · ${date}` : label;
}

/** A frase que resume um pedido já feito.
 *
 *  O Adalove parte isto em dois: a linha do estado fica no fim da aba e a nota
 *  anterior aparece lá em cima, junto da nota. Aqui vira uma frase só — a nota
 *  já está no cabeçalho do modal, e o que interessa saber é que ela MUDOU e qual
 *  era antes, o que só faz sentido lido junto do resultado do pedido.
 *
 *  Cada pedaço é opcional de propósito. O GET já foi conferido contra a API
 *  real, mas só no caso sem pedido: o objeto `revision` nunca chegou preenchido
 *  aqui, então os nomes dos campos dele seguem valendo o que o bundle deles diz.
 *  Se algum estiver diferente, a frase encolhe — em vez de `undefined.toFixed`
 *  derrubar a overlay inteira e deixar o aluno sem plataforma. */
function summary(revision: Revision): string {
  const before =
    typeof revision.gradeResultPrevious === "number"
      ? fmtNota(revision.gradeResultPrevious)
      : null;

  if (revision.status === "pending") {
    const at = formatNaiveDateTime(revision.requestedAt);
    return at ? `Enviado em ${at}. ${ONCE}` : ONCE;
  }
  if (revision.status === "undeferred") {
    return before ? `A nota ${before} foi mantida. ${ONCE}` : `A nota foi mantida. ${ONCE}`;
  }
  return before && revision.decidedAt
    ? `Nota anterior: ${before}, alterada após revisão em ${formatNaiveDate(revision.decidedAt)}. ${ONCE}`
    : ONCE;
}

/** Pedido de revisão de nota, no fim da aba de Avaliação.
 *
 *  Some inteiro quando não há prazo nem pedido: é o caso da maioria dos cartões
 *  (nota não publicada), e uma caixa vazia dizendo que não dá para pedir revisão
 *  de uma atividade sem nota seria ruído em todos eles. */
export function GradeRevision({ activity }: { activity: ActivityView }) {
  const client = useApiClient();
  const toast = useToast();
  const path = revisionPath(activity.id);

  const [state, setState] = useState<RevisionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async (): Promise<RevisionState | null> => {
    if (!client) return null;
    try {
      return await client.get<RevisionState>(path);
    } catch {
      // Endpoint novo: numa turma antiga, ou num Adalove que ainda não o tenha,
      // ele responde erro. Isso não é assunto do aluno — a aba segue sem a
      // seção, como seguia antes de o recurso existir.
      return null;
    }
  }, [client, path]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setOpen(false);
    setReason("");
    void load().then((data) => {
      if (!alive) return;
      setState(data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  async function submit() {
    if (!client?.post) return;
    setSending(true);
    try {
      await client.post(REVISIONS_PATH, {
        studentActivityUuid: activity.id,
        reason: reason.trim(),
      });
      toast.success("Pedido de revisão enviado.");
      setOpen(false);
      setReason("");
      // Relê em vez de montar o pedido aqui: quem decide `canRequest`, o uuid e
      // o carimbo de envio é o servidor, e inventar isso deixaria a tela
      // discordando dele no primeiro F5.
      setState(await load());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível enviar o pedido de revisão: ${error.message}`
          : "Não foi possível enviar o pedido de revisão.",
      );
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  if (loading || !state || (!state.deadlineAt && !state.revision)) return null;

  const { canRequest, deadlineAt, revision } = state;
  const status = revision ? REVISION_STATUS[revision.status] : null;
  const length = reason.trim().length;
  const tooLong = length > REVISION_MAX_CHARS;

  return (
    <div className="space-y-3 border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Marcado e travado depois de enviar: o pedido é um só, e desmarcar
            não desfaz nada. Mesma leitura do Adalove. */}
        <Checkbox
          checked={!!revision || open}
          disabled={!canRequest}
          label="Pedir revisão da nota"
          onChange={setOpen}
        />
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
      </div>

      {revision ? (
        <p className="text-sm text-fg-soft">{summary(revision)}</p>
      ) : canRequest ? (
        <p className="text-sm text-fg-soft">
          Você pode pedir revisão uma única vez, em até {REVISION_WINDOW} após a publicação da
          nota. Prazo: {formatNaiveDateTime(deadlineAt)}.
        </p>
      ) : (
        <p className="text-sm text-fg-soft">
          O prazo de {REVISION_WINDOW} para pedir revisão terminou em{" "}
          {formatNaiveDateTime(deadlineAt)}.
        </p>
      )}

      {!revision && canRequest && open && (
        <div>
          <label className="block text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
            Argumentação
            <textarea
              rows={7}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explique por que você discorda da nota ou do feedback recebido."
              // Mesmo cinto e suspensório do editor de resposta: o body do
              // Adalove usa `user-select:none` e a herança atravessa o shadow
              // root. `mount.tsx` já solta a raiz da página; isto cobre o caso de
              // a regra dele voltar numa troca de rota da SPA.
              style={{ userSelect: "text", WebkitUserSelect: "text" }}
              className={cn(
                "mt-1 block w-full resize-y rounded-control border bg-bg px-3 py-2 text-sm normal-case leading-relaxed tracking-normal text-fg outline-none transition-colors duration-150",
                "placeholder:text-fg-muted",
                tooLong ? "border-red" : "border-line focus:border-accent",
              )}
            />
          </label>

          <div className="mt-1.5 flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
            {tooLong && (
              <span className="mr-auto text-[0.62rem] text-red">
                A argumentação deve ter no máximo {REVISION_MAX_CHARS.toLocaleString("pt-BR")}{" "}
                caracteres.
              </span>
            )}
            <span
              className={cn("text-[0.62rem] tabular", tooLong ? "text-red" : "text-fg-muted")}
            >
              {length.toLocaleString("pt-BR")} / {REVISION_MAX_CHARS.toLocaleString("pt-BR")}{" "}
              caracteres
            </span>
          </div>

          <div className="mt-2 flex justify-end">
            <Button
              variant="primary"
              disabled={!length || tooLong || sending || !client?.post}
              onClick={() => setConfirming(true)}
            >
              {sending ? "Enviando…" : "Enviar pedido de revisão"}
            </Button>
          </div>
        </div>
      )}

      {revision?.professorResponse && (
        <Box title={titled("Resposta do professor", revision.decidedAt)}>
          {revision.professorResponse}
        </Box>
      )}

      {revision?.reason && (
        <Box title={titled("Sua argumentação", revision.requestedAt)}>{revision.reason}</Box>
      )}

      <ConfirmDialog
        open={confirming}
        title="Enviar pedido de revisão?"
        message="Você só pode pedir revisão uma vez nesta atividade. O professor vai recorrigir a entrega, e a nota pode subir, cair ou permanecer a mesma."
        confirmLabel="Enviar pedido"
        cancelLabel="Voltar"
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
