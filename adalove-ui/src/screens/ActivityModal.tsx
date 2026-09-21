import {
  Bold,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  RemoveFormatting,
  Star,
  Strikethrough,
  Underline,
  UserRound,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fmtNota } from "@/lib/format";
import { AskAiButtons } from "~/ai/AskAiButton";
import { AttendanceDetail } from "~/screens/AttendanceDetail";
import { CATEGORY_COLOR } from "~/data/activityTypes";
import { useApi } from "~/data/api";
import { ANSWER_MAX_CHARS } from "~/data/client";
import { STATUS_DONE, STATUS_LABEL, type ActivityStatus } from "~/data/types";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { formatDate } from "~/lib/date";
import { gradeColor } from "~/lib/grade";
import { sanitizeHtml, sanitizeTextOrHtml } from "~/lib/sanitize";
import { Badge } from "~/ui/Badge";
import { Button } from "~/ui/Button";
import { Modal } from "~/ui/Modal";
import { Select } from "~/ui/Select";
import { Tabs } from "~/ui/Tabs";
import { Tooltip } from "~/ui/Tooltip";
import { useToast } from "~/ui/Toast";

// As mesmas seis abas do Adalove. Aparecem sempre, mesmo vazias — igual lá, e
// porque uma aba que some conforme o dado confunde mais do que informa.
//
// Conteúdo vem do /userdata; material, vídeo e assuntos vêm do endpoint de
// detalhe `/student-activities/{uuid}/activity/data`, carregado ao abrir.

type Tab = "conteudo" | "material" | "video" | "avaliacao" | "organizacao" | "feedback";

const TABS: { label: string; value: Tab }[] = [
  { label: "Conteúdo", value: "conteudo" },
  { label: "Material de estudo", value: "material" },
  { label: "Vídeo de estudo", value: "video" },
  { label: "Avaliação", value: "avaliacao" },
  { label: "Organização", value: "organizacao" },
  { label: "Feedback", value: "feedback" },
];

/** A aba de Avaliação só faz sentido em atividade que de fato é avaliada. Numa
 *  aula ou autoestudo sem peso ela abria vazia — "sem enunciado", "sem
 *  avaliação" —, e isso valia para a maioria dos cards.
 *
 *  O critério é ter peso na nota, mas qualquer conteúdo de avaliação também
 *  abre a aba: assim nada some se o Adalove preencher enunciado ou nota numa
 *  atividade sem peso. */
function hasEvaluation(activity: ActivityView): boolean {
  return (
    activity.weight > 0 ||
    activity.evaluated ||
    !!activity.question?.trim() ||
    !!activity.answer?.trim()
  );
}

function tabsFor(activity: ActivityView): { label: string; value: Tab }[] {
  return TABS.filter((t) => t.value !== "avaliacao" || hasEvaluation(activity));
}

interface Material {
  uuid?: string;
  url?: string;
  link?: string;
  title?: string;
}

interface ActivityDetail {
  subjects?: { uuid: string; subject: string }[];
  prerequisites?: { uuid?: string; prerequisite?: string; title?: string }[];
  activityStudyMaterial?: Material[];
  activityVideoMaterial?: Material[];
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-fg-muted">{children}</p>;
}

/** ~10 linhas de `text-sm leading-relaxed`. Acima disso o enunciado empurra o
 *  resto do modal para fora da vista. */
const CLAMP_PX = 232;

/** Conteúdo do Adalove com "Ver mais", igual ao deles. O corte é medido, não
 *  chutado por contagem de caracteres: o HTML tem listas, títulos e imagens, e
 *  contar caracteres erraria feio.
 *
 *  Aceita HTML ou texto puro: enunciado e descrição vêm marcados, feedback e
 *  resposta nem sempre. */
function Html({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  // Altura do corte arredondada para baixo até fechar uma linha inteira. Cortar
  // na altura crua deixava meia linha de letras aparecendo na borda.
  const [clampPx, setClampPx] = useState(CLAMP_PX);
  const sanitized = useMemo(() => sanitizeTextOrHtml(html), [html]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      // `line-height: normal` não vira número em getComputedStyle; nesse caso o
      // 1.55 do tema é a melhor aproximação.
      const styles = getComputedStyle(el);
      const line = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.55;
      const lines = Math.max(1, Math.floor(CLAMP_PX / line));
      setClampPx(line * lines);
      setOverflows(el.scrollHeight > line * lines + 8);
    };
    check();
    // Imagens e fontes chegam depois e mudam a altura.
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sanitized]);

  // Fade na PRÓPRIA camada de texto (máscara), em vez de uma faixa com a cor do
  // fundo por cima: o mesmo componente aparece sobre `surface` (modal) e sobre
  // `bg` (caixa da resposta), e a faixa colorida só combinava com um dos dois.
  const fade =
    "linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent 100%)";

  return (
    <div>
      <div
        ref={ref}
        className={cn(
          "adalove-prose text-sm leading-relaxed text-fg-soft",
          !expanded && overflows && "overflow-hidden",
        )}
        style={
          !expanded && overflows
            ? { maxHeight: clampPx, maskImage: fade, WebkitMaskImage: fade }
            : undefined
        }
        // Sanitizado: sem script/iframe/handlers inline.
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />

      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-accent transition-opacity hover:opacity-80"
        >
          <ChevronDown
            size={12}
            aria-hidden
            className={cn("transition-transform duration-200", expanded && "rotate-180")}
          />
          {expanded ? "Ver menos" : "Ver mais"}
        </button>
      )}
    </div>
  );
}

function LinkList({
  items,
  icon: Icon,
  empty,
}: {
  items: Material[];
  icon: typeof ExternalLink;
  empty: string;
}) {
  if (!items.length) return empty ? <Empty>{empty}</Empty> : null;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => {
        const href = item.url ?? item.link ?? null;
        const label = item.title ?? href ?? "Material";
        return (
          <li key={item.uuid ?? i}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-2 text-sm text-accent hover:underline"
              >
                <Icon size={14} aria-hidden className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-all">{label}</span>
              </a>
            ) : (
              <span className="text-sm text-fg-soft">{label}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Alternativa precisa ao arraste — e a única forma quando a coluna de destino
 *  está fora da tela. Mesmo controle que o Adalove tem no rodapé do card. */
function MoveCard({
  activity,
  view,
  onMove,
}: {
  activity: ActivityView;
  view: SectionView;
  onMove: (activity: ActivityView, status: ActivityStatus, sort: number) => void;
}) {
  // O `sort` da API é uma ordenação global (chega a 22 numa coluna de 4), não o
  // índice dentro da coluna. A posição que o usuário vê e edita é o índice.
  const columnOf = (s: ActivityStatus) =>
    view.activities.filter((a) => a.week === activity.week && a.status === s);
  const currentIndex = columnOf(activity.status).findIndex((a) => a.id === activity.id) + 1;

  const [status, setStatus] = useState<ActivityStatus>(activity.status);
  const [position, setPosition] = useState(String(Math.max(currentIndex, 1)));

  const max =
    columnOf(status).filter((a) => a.id !== activity.id).length + 1;

  const parsed = Number(position);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= max;
  const unchanged = status === activity.status && parsed === currentIndex;

  return (
    <div>
      <div className="mb-2 text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
        Mover cartão
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <label className="block text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
            Coluna
          </label>
          <Select
            className="mt-1"
            aria-label="Coluna"
            value={String(status)}
            onChange={(e) => setStatus(Number(e.target.value) as ActivityStatus)}
          >
            {([1, 2, 3] as ActivityStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-24">
          <label className="block text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
            Posição
          </label>
          <input
            inputMode="numeric"
            aria-label="Posição"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className={cn(
              "mt-1 h-9 w-full rounded-control border bg-bg px-3 text-center font-mono text-sm text-fg outline-none transition-colors tabular",
              valid ? "border-line focus:border-accent" : "border-red",
            )}
          />
        </div>

        <Button
          variant="primary"
          disabled={!valid || unchanged}
          onClick={() => onMove(activity, status, parsed)}
        >
          Mudar
        </Button>

        <span className="w-full text-[0.62rem] text-fg-muted">
          {valid
            ? `1 a ${max} em ${STATUS_LABEL[status]}`
            : `A posição precisa estar entre 1 e ${max}`}
        </span>
      </div>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Os controles de texto que a barra do Adalove tem e que fazem sentido numa
 *  resposta de aluno. Ficaram de fora os que só existem lá porque o CKEditor os
 *  traz de graça: alinhamento, cor de fonte, tabela, mídia, LaTeX. */
type ToolbarItem =
  | { key: string; sep: true }
  | { key: string; sep?: false; label: string; command: string; icon: LucideIcon };

const TOOLBAR: ToolbarItem[] = [
  { key: "bold", label: "Negrito", command: "bold", icon: Bold },
  { key: "italic", label: "Itálico", command: "italic", icon: Italic },
  { key: "underline", label: "Sublinhado", command: "underline", icon: Underline },
  { key: "strike", label: "Tachado", command: "strikeThrough", icon: Strikethrough },
  { key: "s1", sep: true },
  { key: "ul", label: "Lista", command: "insertUnorderedList", icon: List },
  { key: "ol", label: "Lista numerada", command: "insertOrderedList", icon: ListOrdered },
  { key: "s2", sep: true },
  { key: "link", label: "Inserir link", command: "createLink", icon: Link2 },
  { key: "unlink", label: "Remover link", command: "unlink", icon: Link2Off },
  { key: "clear", label: "Limpar formatação", command: "removeFormat", icon: RemoveFormatting },
];

/** Salva 1,5s depois da última tecla. A UI original só salva ao sair do campo;
 *  aqui o modal fecha no Esc e num clique fora, então esperar o blur perderia
 *  texto de quem fecha logo depois de escrever. O blur e o fechamento também
 *  disparam o salvamento, então nenhuma das duas pontas fica descoberta. */
const AUTOSAVE_DELAY_MS = 1500;

/** `contentEditable` em vez de `<textarea>`: a resposta é HTML — o editor do
 *  Adalove é rico —, e um textarea mostraria as tags para o aluno e achataria a
 *  formatação de quem já respondeu por lá. */
function AnswerEditor({
  activity,
  onSave,
}: {
  activity: ActivityView;
  onSave: (html: string) => Promise<unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [tooLong, setTooLong] = useState(false);
  const toast = useToast();

  // O conteúdo é do DOM, não do React: reconciliar innerHTML a cada tecla
  // mataria o cursor. O React só o escreve ao trocar de atividade.
  //
  // `TextOrHtml` porque nem toda resposta salva é HTML: a que veio de fora do
  // editor rico chega como texto, e sem converter as quebras ela abriria aqui
  // como um parágrafo só.
  const initial = useMemo(
    () => sanitizeTextOrHtml(activity.answer ?? ""),
    [activity.answer, activity.id],
  );
  const savedRef = useRef(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `onSave` vem do App e muda de identidade a cada render dele; guardar em ref
  // deixa o efeito de flush depender só da atividade.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initial;
    savedRef.current = initial;
    setState("idle");
    setTooLong(false);
    // Só ao trocar de atividade: `initial` muda quando a resposta salva volta
    // do App, e reescrever o DOM aí jogaria o cursor para o começo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id]);

  /** Lê o editor. Vazio de verdade vira "" — o contentEditable deixa `<br>`
   *  para trás quando se apaga tudo, e isso salvaria uma resposta "não vazia". */
  const read = () => {
    const el = ref.current;
    if (!el) return null;
    const html = sanitizeHtml(el.innerHTML);
    return el.textContent?.trim() || /<img\b/i.test(html) ? html : "";
  };

  const flush = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const html = read();
    if (html === null || html === savedRef.current) return;

    if (html.length > ANSWER_MAX_CHARS) {
      setState("error");
      setTooLong(true);
      return;
    }
    setTooLong(false);

    // Marca como salvo ANTES da resposta: se o aluno continuar digitando, o
    // próximo flush compara contra o que foi enviado, não contra o texto antigo.
    const sending = html;
    savedRef.current = sending;
    setState("saving");
    try {
      await onSaveRef.current(sending);
      // Outra tecla já mudou o texto: o "Salvo" seria mentira até o próximo flush.
      setState(read() === sending ? "saved" : "idle");
      // O toast repete o que o indicador já diz, de propósito: é a confirmação
      // que a UI original dá, e ela também aparece quando o modal já fechou —
      // que é justamente quando o indicador não está mais na tela.
      toast.success("Resposta salva com sucesso!");
    } catch (error) {
      savedRef.current = "\u0000não salvo";
      setState("error");
      toast.error(
        error instanceof Error
          ? `Não foi possível salvar a resposta: ${error.message}`
          : "Não foi possível salvar a resposta.",
      );
    }
  };

  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Fechar o modal ou trocar de atividade desmonta o editor: o que estava no
  // debounce vai junto, senão o último trecho digitado se perde.
  useEffect(() => {
    return () => {
      void flushRef.current();
    };
  }, [activity.id]);

  const onInput = () => {
    setState("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  };

  /** `execCommand` é oficialmente obsoleto, mas é o único caminho para formatar
   *  em `contentEditable` sem trazer um editor inteiro (o do Adalove é o CKEditor,
   *  ~200KB) para dentro de um content script. Todos os navegadores ainda
   *  suportam, e o que sai é o mesmo HTML simples que a API deles já recebe. */
  const exec = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    onInput();
  };

  const link = () => {
    const url = window.prompt("Endereço do link:", "https://");
    if (!url) return;
    exec("createLink", url);
  };

  return (
    <div className="rounded-card border border-line bg-bg p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">Resposta</div>
        <span
          aria-live="polite"
          className={cn(
            "text-[0.58rem] tabular",
            state === "error" ? "text-red" : "text-fg-muted",
          )}
        >
          {state === "saving" && "Salvando…"}
          {state === "saved" && "Salvo"}
          {state === "error" && "Não salvo"}
        </span>
      </div>

      {/* `onMouseDown` com preventDefault em cada botão: sem isso o clique tira o
          foco do editor, a seleção some e o comando não teria em que aplicar. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-0.5 border-b border-line-soft pb-1.5">
        {TOOLBAR.map((item) => {
          if (item.sep) return <span key={item.key} aria-hidden className="mx-1 h-4 w-px bg-line" />;
          const Icon = item.icon;
          return (
            <Tooltip key={item.key} label={item.label}>
              <button
                type="button"
                aria-label={item.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (item.command === "createLink" ? link() : exec(item.command))}
                className="flex size-7 items-center justify-center rounded-control text-fg-soft transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
              >
                <Icon size={14} aria-hidden />
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Sua resposta"
        data-placeholder="Escreva sua resposta…"
        onInput={onInput}
        onBlur={() => void flush()}
        // Fica como cinto e suspensório contra o `user-select:none` do body do
        // Adalove — `hideOriginalUi` (mount.tsx) já solta a raiz da página. O
        // `-webkit-user-modify` é o que importa aqui: é ele que garante o status
        // de elemento editável, a única exceção da regra do css-ui que propaga
        // `none` para todos os descendentes, e sem ele o campo ficava sem cursor.
        style={{ userSelect: "text", WebkitUserSelect: "text", WebkitUserModify: "read-write" }}
        className={cn(
          "adalove-prose mt-1.5 min-h-24 w-full rounded-control px-2 py-1.5 text-sm leading-relaxed",
          // Sem realce de foco: quem está digitando já sabe onde está, e o anel
          // colorido em volta de um campo grande competia com o texto.
          "text-fg outline-none",
          "empty:before:text-fg-muted empty:before:content-[attr(data-placeholder)]",
        )}
      />

      {tooLong && (
        <p className="mt-1.5 text-[0.62rem] text-red">
          A resposta passou de {ANSWER_MAX_CHARS.toLocaleString("pt-BR")} caracteres e não foi
          salva — é o limite do Adalove. Reduza o texto.
        </p>
      )}
    </div>
  );
}

export function ActivityModal({
  activity,
  view,
  onClose,
  onMove,
  onAnswer,
}: {
  activity: ActivityView | null;
  view: SectionView;
  onClose: () => void;
  onMove?: (activity: ActivityView, status: ActivityStatus, sort: number) => void;
  /** Persiste a resposta. Ausente => a resposta fica só de leitura. */
  onAnswer?: (activity: ActivityView, html: string) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<Tab>("conteudo");

  const { data: detail } = useApi<ActivityDetail>(
    activity ? `/student-activities/${activity.id}/activity/data` : null,
  );
  const subjects = useMemo(() => detail?.subjects ?? [], [detail]);
  const visibleTabs = useMemo(() => (activity ? tabsFor(activity) : TABS), [activity]);

  // Trocar de atividade pode tirar do ar a aba aberta (a de Avaliação some em
  // quem não é avaliado): sem isto o modal abriria num painel inexistente.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.value === tab)) setTab("conteudo");
  }, [visibleTabs, tab]);

  if (!activity) return null;

  const Icon = activity.kind.icon;
  const canMove = !!onMove && view.section.allowCardMovement;

  return (
    <Modal
      open
      onClose={onClose}
      className="max-w-[820px]"
      icon={
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-control"
          style={{ background: `color-mix(in srgb, ${activity.kind.color} 15%, transparent)` }}
        >
          <Icon size={15} aria-hidden style={{ color: activity.kind.color }} />
        </span>
      }
      title={
        <span className="flex items-center gap-2">
          <span className="min-w-0">{activity.caption}</span>
          {activity.favorite && (
            <Star size={13} aria-hidden className="shrink-0 fill-yellow text-yellow" />
          )}
        </span>
      }
      subtitle={`${activity.kind.name} · ${activity.week}`}
      // A nota no cabeçalho, e não só na aba de Avaliação: num cartão já
      // corrigido ela é o que a pessoa abriu o cartão para ver, e estava a dois
      // cliques de distância. Continua também na aba, junto do enunciado e da
      // resposta.
      //
      // Encostada no nome, e o fio vertical separando os dois campos. Os dois
      // `self-stretch` são o que dá ao fio a altura do bloco de identificação
      // inteiro (título E subtítulo) sem número fixo: o de fora faz o bloco
      // ocupar a altura da linha, o de dentro estica o fio dentro dele.
      titleAside={
        activity.evaluated ? (
          <div className="flex shrink-0 items-center gap-3 self-stretch">
            <span aria-hidden className="w-px self-stretch bg-line" />
            <div>
              <div
                className="font-mono text-2xl font-medium leading-none tracking-tight tabular"
                style={{ color: gradeColor(activity.grade) }}
              >
                {fmtNota(activity.grade)}
              </div>
              <div className="mt-1 text-[0.55rem] uppercase tracking-[0.04em] text-fg-muted">
                Avaliação
              </div>
            </div>
          </div>
        ) : null
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-fg-soft">Explicar com IA</span>
          <AskAiButtons activity={activity} view={view} />
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {activity.weight > 0 ? (
            <Badge tone="positive">Atividade ponderada: {activity.weight} pontos</Badge>
          ) : (
            <Badge tone="negative">Atividade não ponderada</Badge>
          )}
          {activity.required && <Badge tone="info">Atividade obrigatória</Badge>}
          <Badge color="var(--color-orange)">
            {activity.studyType === "class" ? "Em sala" : "Semana"}
          </Badge>
          <Badge color={CATEGORY_COLOR[activity.category]}>{activity.category}</Badge>
          <Badge
            tone={activity.status === 3 ? "positive" : activity.status === 2 ? "warning" : "default"}
          >
            {STATUS_LABEL[activity.status]}
          </Badge>
          {activity.axis && <Badge>Eixo {activity.axis}</Badge>}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-soft">
          {activity.professor && (
            <span className="inline-flex items-center gap-1.5">
              <UserRound size={12} aria-hidden className="text-fg-muted" />
              {activity.professor}
            </span>
          )}
          {activity.assistant && (
            <span className="inline-flex items-center gap-1.5">
              <Users size={12} aria-hidden className="text-fg-muted" />
              {activity.assistant}
            </span>
          )}
          {formatDate(activity.date) && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={12} aria-hidden className="text-fg-muted" />
              {formatDate(activity.date)}
            </span>
          )}
        </div>

        {/* Fora das abas de propósito: quem abre um encontro pela tela de Faltas
            está procurando exatamente isto, e não deveria ter que caçar aba. */}
        <AttendanceDetail slots={activity.attendance} />

        <Tabs options={visibleTabs} value={tab} onChange={setTab} />

        {tab === "conteudo" && (
          <div className="space-y-4">
            {activity.descriptionHtml ? (
              <Html html={activity.descriptionHtml} />
            ) : (
              <Empty>Esta atividade não tem descrição.</Empty>
            )}

            {subjects.length > 0 && (
              <div className="border-t border-line-soft pt-3">
                <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                  Assuntos relacionados
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {subjects.map((s) => (
                    <li key={s.uuid}>
                      <Badge>{s.subject}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "material" && (
          <div className="space-y-3">
            {activity.url && (
              <a
                href={activity.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-2 text-sm text-accent hover:underline"
              >
                <ExternalLink size={14} aria-hidden className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-all">{activity.url}</span>
              </a>
            )}
            <LinkList
              items={detail?.activityStudyMaterial ?? []}
              icon={ExternalLink}
              empty={activity.url ? "" : "Sem material de estudo cadastrado."}
            />
          </div>
        )}

        {tab === "video" && (
          <LinkList
            items={detail?.activityVideoMaterial ?? []}
            icon={Video}
            empty="Sem vídeo de estudo cadastrado."
          />
        )}

        {tab === "avaliacao" && (
          <div className="space-y-4">
            {activity.question ? (
              <div>
                <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                  Pergunta
                </div>
                <div className="mt-1">
                  <Html html={activity.question} />
                </div>
              </div>
            ) : (
              <Empty>Esta atividade não tem enunciado de avaliação.</Empty>
            )}

            {/* Em "Feito" a resposta é só leitura: o Adalove trava a edição do
                cartão concluído, e deixar editar aqui daria um texto que a
                plataforma recusaria — pior do que não oferecer o campo. */}
            {onAnswer && activity.status !== STATUS_DONE ? (
              <AnswerEditor
                key={activity.id}
                activity={activity}
                onSave={(html) => onAnswer(activity, html)}
              />
            ) : (
              (activity.answer || activity.status === STATUS_DONE) && (
                <div className="rounded-card border border-line bg-bg p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                      Resposta
                    </div>
                    {activity.status === STATUS_DONE && (
                      <span className="text-[0.58rem] text-fg-muted">
                        Concluída — mova para Fazendo para editar
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    {activity.answer ? (
                      <Html html={activity.answer} />
                    ) : (
                      <span className="text-sm text-fg-muted">Sem resposta.</span>
                    )}
                  </div>
                </div>
              )
            )}

            <div className="border-t border-line-soft pt-3 text-sm">
              <span className="text-fg-muted">Avaliação: </span>
              {activity.evaluated ? (
                <span
                  className="font-mono tabular"
                  style={{ color: gradeColor(activity.grade) }}
                >
                  {fmtNota(activity.grade)}
                </span>
              ) : (
                <span className="text-fg-soft">Sem avaliação até o momento</span>
              )}
            </div>
          </div>
        )}

        {tab === "organizacao" && (
          <div className="space-y-4">
            {activity.notes ? (
              <div>
                <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                  Anotações
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-fg-soft">{activity.notes}</p>
              </div>
            ) : (
              <Empty>Você não escreveu anotações nesta atividade.</Empty>
            )}

            {(activity.positivePoints ?? activity.negativePoints) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {activity.positivePoints && (
                  <div>
                    <div className="text-[0.58rem] uppercase tracking-[0.06em] text-green">
                      Pontos positivos
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-fg-soft">
                      {activity.positivePoints}
                    </p>
                  </div>
                )}
                {activity.negativePoints && (
                  <div>
                    <div className="text-[0.58rem] uppercase tracking-[0.06em] text-red">
                      Pontos negativos
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-fg-soft">
                      {activity.negativePoints}
                    </p>
                  </div>
                )}
              </div>
            )}

            {(detail?.prerequisites?.length ?? 0) > 0 && (
              <div className="border-t border-line-soft pt-3">
                <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                  Pré-requisitos
                </div>
                <ul className="mt-2 space-y-1 text-sm text-fg-soft">
                  {detail!.prerequisites!.map((p, i) => (
                    <li key={p.uuid ?? i}>{p.title ?? p.prerequisite}</li>
                  ))}
                </ul>
              </div>
            )}

            {activity.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activity.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "feedback" && (
          <div className="space-y-4">
            {activity.feedback ? (
              <div>
                <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                  Individual
                </div>
                <div className="mt-1">
                  <Html html={activity.feedback} />
                </div>
              </div>
            ) : (
              <Empty>Sem feedback do professor até o momento.</Empty>
            )}

            {activity.feedbackGroup && (
              <div className="border-t border-line-soft pt-3">
                <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                  Do grupo
                </div>
                <div className="mt-1">
                  <Html html={activity.feedbackGroup} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dentro da rolagem, e não no rodapé fixo: o controle ocupa duas linhas
            e comia a altura útil do conteúdo em todas as abas. */}
        {canMove && (
          <div className="border-t border-line-soft pt-4">
            <MoveCard activity={activity} view={view} onMove={onMove!} />
          </div>
        )}
      </div>
    </Modal>
  );
}
