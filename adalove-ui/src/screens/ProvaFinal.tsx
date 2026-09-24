import {
  ArrowLeft,
  ClipboardCopy,
  ExternalLink,
  GraduationCap,
  Minus,
  Plus,
  Presentation,
  Target,
} from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { fmtNota } from "@/lib/format";
import { AI_PROVIDERS, MAX_URL_PROMPT_CHARS, type AiProvider } from "~/ai/providers";
import {
  buildExamPrompt,
  buildExamSubjects,
  daysUntil,
  distribute,
  examPoints,
  findExam,
  fmtPontos,
  plural,
  type ExamFormat,
  type ExamPromptKind,
  type ExamSubject,
  type ExamType,
} from "~/ai/exam";
import { buildSprints, type Sprint } from "~/ai/summary";
import { CATEGORY_COLOR } from "~/data/activityTypes";
import { currentWeek } from "~/data/schedule";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { formatDate } from "~/lib/date";
import { Logo } from "~/lib/logos";
import { copyText } from "~/lib/prefs";
import { ProvaCountdown } from "~/screens/ProvaCountdown";
import { Badge } from "~/ui/Badge";
import { Card, CardTitle } from "~/ui/Card";
import { CheckboxMenu } from "~/ui/CheckboxMenu";
import { Donut, type DonutSlice } from "~/ui/Donut";
import { Select } from "~/ui/Select";
import { Switch } from "~/ui/Switch";
import { Table, TableContainer, Td, Th } from "~/ui/Table";
import { Tabs, type TabOption } from "~/ui/Tabs";
import { useToast } from "~/ui/Toast";

// Tela de preparação para a prova final: substitui a Vida Acadêmica inteira
// enquanto está aberta. A pergunta que ela responde é uma só — "por onde eu
// começo?" — e a resposta sai do único peso que o Adalove deixa medir: quantas
// aulas cada matéria teve. Ver `~/ai/exam.ts`, onde essa conta mora.

/** Ordem fixa das cores de matéria, tirada dos tokens do tema.
 *
 *  A ordem não é decorativa: é a que passa nas checagens de separação para
 *  daltonismo (protan/deutan/tritan) e de visão normal nos DOIS modos, com as
 *  cores que o produto já tem. Trocar a ordem, ou intercalar outra cor no meio,
 *  refaz pares vizinhos que reprovam — o azul ao lado do roxo, o verde ao lado
 *  do teal. Cor nunca é a única pista: a legenda e a tabela repetem tudo. */
const SUBJECT_COLORS = [
  "var(--color-accent)",
  "var(--color-orange)",
  "var(--color-artefato)",
  "var(--color-prova)",
  "var(--color-yellow)",
  "var(--color-teal)",
  "var(--color-purple)",
  "var(--color-green)",
];

/** Da nona matéria em diante o gráfico junta tudo em "Outras": inventar uma cor
 *  fora da paleta destruiria a separação validada acima. A tabela continua
 *  listando uma por uma. */
const MAX_SLICES = SUBJECT_COLORS.length;

/** O formato padrão é o da prova do Inteli: 20 múltiplas de 0,3 e 2 discursivas
 *  de 2,0 — 10 pontos ao todo. Quem tiver outra prova ajusta nos campos. */
const DEFAULT_MULTIPLA = 20;
const DEFAULT_VALOR_MULTIPLA = 0.3;
const DEFAULT_DISCURSIVAS = 2;
const DEFAULT_VALOR_DISCURSIVA = 2;

/** Tetos dos campos. Prova com mais de 50 questões de um tipo só não existe, e o
 *  limite evita que um dedo preso no "+" gere um prompt absurdo. */
const MAX_QUESTIONS = 50;
const MAX_POINTS = 10;

/** Teto das observações. O bastante para o recado do professor e o que trava o
 *  aluno; acima disso vira um texto que compete com o conteúdo do prompt. */
const MAX_NOTES = 600;
/** O projeto do grupo cabe mais: é contexto do que vai ser apresentado. */
const MAX_PROJECT = 1000;


/** A prova final abre a tela: é a avaliação que traz a pessoa aqui, e é o padrão
 *  da aba. Demo e desafio vêm depois, na ordem do módulo. */
const TIPO_TABS: TabOption<ExamType>[] = [
  { label: "Prova final", value: "final", icon: GraduationCap },
  { label: "Demo", value: "demo", icon: Presentation },
  { label: "Desafio", value: "desafio", icon: Target },
];

/** Título e explicação de cada cartão de prompt, por avaliação. Os dois pedidos
 *  existem nas três, mas pedir "a prova" numa demo não faria sentido: ali o que
 *  se treina são as perguntas da banca. */
const PROMPT_CARDS: Record<
  ExamType,
  Record<ExamPromptKind, { title: string; hint: (questoes: number) => string }>
> = {
  // Nada aqui afirma como a demo é: quem descreve o formato é o aluno, no campo
  // acima, e é dele que os dois prompts partem.
  demo: {
    simulado: {
      title: "Treinar as perguntas",
      hint: () =>
        "As perguntas que a apresentação pode gerar, no formato que você descreveu, e o que cada resposta precisa provar.",
    },
    plano: {
      title: "Roteiro da apresentação",
      hint: () => "O que mostrar, em que ordem e o que revisar antes, no formato que você descreveu.",
    },
  },
  desafio: {
    simulado: {
      title: "Gerar o desafio",
      hint: (q) =>
        `Um simulado de ${q} ${q === 1 ? "questão" : "questões"} só da matéria escolhida, com o gabarito no fim.`,
    },
    plano: {
      title: "Plano de estudo",
      hint: () => "Por onde começar na matéria, o que revisar e o que precisa sair no papel.",
    },
  },
  final: {
    simulado: {
      title: "Gerar a prova",
      hint: (q) =>
        `Um simulado de ${q} ${q === 1 ? "questão" : "questões"} no formato do Inteli, com o gabarito só no fim, para fazer no papel antes de conferir.`,
    },
    plano: {
      title: "Plano de estudo",
      hint: () =>
        "Por onde começar, quanto tempo dar a cada matéria e o que revisar em cada uma, sem questões.",
    },
  },
};

/** A sprint da demo. Dropdown porque a pessoa pode estar preparando a de agora
 *  ou revendo uma passada, e a contagem de artefatos diz de cara se a sprint
 *  escolhida tem entrega própria. */
function DemoSprint({
  sprints,
  sprint,
  onSprint,
}: {
  sprints: Sprint[];
  sprint: Sprint | null;
  onSprint: (id: string) => void;
}) {
  return (
    <div className="min-w-0">
      <CardTitle>Sprint da demo</CardTitle>
      <div className="mt-3 max-w-xs">
        <Select value={sprint?.id ?? ""} onChange={(e) => onSprint(e.target.value)}>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} · {s.weeksLabel}
            </option>
          ))}
        </Select>
      </div>

      {sprint && (
        <>
          <p className="mt-3 text-sm text-fg">
            {sprint.artifacts.length > 0
              ? `${plural(sprint.artifacts.length, "artefato", "artefatos")} para apresentar.`
              : "Esta sprint não tem artefato próprio: ela alimenta a entrega da seguinte."}
          </p>
          <ul className="mt-2 space-y-1">
            {sprint.artifacts.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 text-xs text-fg-soft">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: CATEGORY_COLOR.Artefato }}
                />
                <span className="min-w-0 flex-1">{a.caption}</span>
                {a.weight > 0 && (
                  <span className="shrink-0 font-mono text-[0.62rem] text-fg-muted tabular">
                    {a.weight} pts
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A matéria do desafio e as aulas dela que caem.
 *
 *  Um desafio raramente cobra a matéria inteira: cobra o que foi dado desde o
 *  último. Por isso a segunda escolha existe, e é ela que define o conteúdo do
 *  prompt. */
function DesafioMateria({
  subjects,
  materia,
  onMateria,
  aulas,
  selecionadas,
  onToggleAula,
  onAllAulas,
}: {
  subjects: ExamSubject[];
  materia: ExamSubject | null;
  onMateria: (id: string) => void;
  aulas: ActivityView[];
  selecionadas: Set<string>;
  onToggleAula: (id: string) => void;
  onAllAulas: (select: boolean) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="grid gap-4 sm:grid-cols-2 sm:max-w-2xl">
        <div className="min-w-0">
          <CardTitle>Matéria do desafio</CardTitle>
          <div className="mt-3">
            <Select value={materia?.id ?? ""} onChange={(e) => onMateria(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.professor ? ` · ${s.professor}` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="min-w-0">
          <CardTitle>Aulas que caem</CardTitle>
          <div className="mt-3">
            <CheckboxMenu
              noun={["aula", "aulas"]}
              options={aulas.map((a) => ({
                id: a.id,
                label: a.caption,
                sub: a.week,
              }))}
              selected={selecionadas}
              onToggle={onToggleAula}
              onAll={onAllAulas}
            />
          </div>
        </div>
      </div>

      {materia && (
        <p className="mt-3 text-sm text-fg">
          {selecionadas.size === aulas.length
            ? `A matéria inteira entra no prompt: ${plural(aulas.length, "aula", "aulas")}.`
            : `${plural(selecionadas.size, "aula", "aulas")} de ${aulas.length} no prompt.`}{" "}
          {/* Os materiais seguem as aulas marcadas: manter os das semanas que
              ficaram de fora encheria o prompt do que não cai. */}
          {selecionadas.size < aulas.length &&
            "Os materiais das semanas dessas aulas vão junto; o resto fica de fora."}
        </p>
      )}
    </div>
  );
}

/** Campo de texto livre num cartão. São três na tela (observações, formato da
 *  avaliação, projeto do grupo) e todos se comportam igual: título, dica,
 *  textarea com teto e contador que só aparece perto do limite. */
function TextCard({
  step,
  title,
  hint,
  optional,
  value,
  onChange,
  max,
  rows,
  placeholder,
}: {
  step: number;
  title: string;
  hint?: string;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows: number;
  placeholder: string;
}) {
  return (
    <Card className="gi-enter p-4" style={enterDelay(step)}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <CardTitle>{title}</CardTitle>
        {optional && <span className="text-[0.62rem] text-fg-muted">(opcional)</span>}
      </div>
      {hint && <p className="mt-1.5 text-[0.62rem] leading-relaxed text-fg-muted">{hint}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        rows={rows}
        placeholder={placeholder}
        className="mt-3 w-full resize-y rounded-control border border-line bg-bg px-3 py-2 text-sm leading-relaxed text-fg outline-none transition-colors duration-150 placeholder:text-fg-muted focus:border-accent"
      />
      {/* O contador só aparece quando o teto começa a importar. */}
      {value.length > max * 0.7 && (
        <div className="mt-1 text-right font-mono text-[0.6rem] text-fg-muted tabular">
          {value.length}/{max}
        </div>
      )}
    </Card>
  );
}

/** Passo do escalonamento da entrada, em segundos. Curto de propósito: é para a
 *  tela se montar de cima para baixo, não para a pessoa esperar — os oito blocos
 *  inteiros cabem em meio segundo. */
const ENTER_STEP = 0.06;

function enterDelay(step: number): CSSProperties {
  // Propriedade customizada: o CSS (`.gi-enter`, theme.css) lê o atraso daqui.
  return { "--gi-enter-delay": `${(step * ENTER_STEP).toFixed(2)}s` } as CSSProperties;
}

/** Envelope de entrada, para blocos que não têm um elemento próprio onde
 *  pendurar a classe. Quem já tem (um Card) usa `gi-enter` + `enterDelay`
 *  direto, sem ganhar uma div a mais. */
function Enter({
  step = 0,
  className,
  children,
}: {
  step?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("gi-enter", className)} style={enterDelay(step)}>
      {children}
    </div>
  );
}

/** A conclusão do gráfico em UMA frase — é o que o aluno precisa levar daqui.
 *  Os parágrafos que explicavam a mesma coisa em prosa saíram: a legenda e a
 *  tabela já dizem os números, e ninguém lê três parágrafos para saber por onde
 *  começar. */
function headline(subjects: ExamSubject[], totalAulas: number): string {
  const top = subjects[0];
  if (!top) return "Nenhuma matéria selecionada.";

  const second = subjects[1];
  const share = Math.round((top.aulas.length / totalAulas) * 100);

  if (!second) {
    return `${top.label} é a única matéria do recorte: ${plural(
      top.aulas.length,
      "aula",
      "aulas",
    )} e ${plural(top.materiais.length, "material", "materiais")} de estudo.`;
  }

  if (top.aulas.length === second.aulas.length) {
    const lideres = subjects.filter((s) => s.aulas.length === top.aulas.length).length;
    return `${
      lideres > 2 ? `${lideres} matérias estão empatadas na frente` : `${top.label} e ${second.label} estão empatadas`
    }, com ${plural(top.aulas.length, "aula", "aulas")} cada. Divida o tempo entre elas.`;
  }

  return `${top.label} é a matéria com mais aulas: ${top.aulas.length} das ${totalAulas} (${share}%)${
    top.aulas.length >= second.aulas.length * 1.5 ? ". Comece por ela." : "."
  }`;
}

/** Recorte do conteúdo: quais matérias caem nesta prova.
 *
 *  Existe porque "a prova final" não é sempre o módulo inteiro — tem prova de
 *  meio de módulo, prova que pula o que já caiu, simulado de uma matéria só. O
 *  que está marcado aqui manda em tudo abaixo: o gráfico, a divisão das questões
 *  e o prompt. */
function SubjectPicker({
  subjects,
  excluded,
  onToggle,
  onAll,
}: {
  subjects: ExamSubject[];
  excluded: Set<string>;
  onToggle: (id: string) => void;
  onAll: (select: boolean) => void;
}) {
  const selected = subjects.filter((s) => !excluded.has(s.id)).length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
          Conteúdo que cai na prova
        </span>
        <span className="font-mono text-[0.62rem] text-fg-muted tabular">
          {selected}/{subjects.length}
        </span>
        <button
          type="button"
          onClick={() => onAll(selected < subjects.length)}
          className="text-[0.62rem] text-accent transition-opacity hover:opacity-80"
        >
          {selected < subjects.length ? "marcar todas" : "desmarcar todas"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {subjects.map((s, i) => {
          const on = !excluded.has(s.id);
          const color = SUBJECT_COLORS[i] ?? "var(--color-fg-muted)";
          return (
            <button
              key={s.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(s.id)}
              title={s.professor ?? undefined}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-control border px-2.5 text-xs transition-colors duration-150",
                on
                  ? "border-line bg-surface-hover text-fg"
                  : "border-line bg-surface text-fg-muted hover:text-fg-soft",
              )}
            >
              {/* O ponto é o mesmo do gráfico e da tabela: apagado, a matéria
                  sumiu do recorte — e some das três ao mesmo tempo. */}
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full transition-opacity"
                style={{ background: color, opacity: on ? 1 : 0.25 }}
              />
              <span className={cn(!on && "line-through decoration-1")}>{s.label}</span>
              <span className="font-mono text-[0.62rem] text-fg-muted tabular">
                {s.aulas.length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Quantas questões e quanto cada uma vale.
 *
 *  Os dois campos andam juntos porque a pergunta é uma só — "como a prova é
 *  montada?" — e separá-los faria a pessoa preencher o peso longe da contagem
 *  que ele multiplica.
 *
 *  Os passos são ícones em caixa `flex`, não os glifos "−" e "+": texto dentro
 *  de botão se apoia na linha de base da fonte e ficava alguns pixels acima do
 *  centro; o ícone é centrado pela caixa e não depende da métrica da fonte. */
function QuestionField({
  label,
  hint,
  count,
  onCount,
  value,
  onValue,
}: {
  label: string;
  hint: string;
  count: number;
  onCount: (value: number) => void;
  value: number;
  onValue: (value: number) => void;
}) {
  // Enquanto digita, o campo pode ficar vazio (ou com uma vírgula solta); o
  // valor só volta a mandar no conteúdo quando o foco sai.
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [valueDraft, setValueDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.max(0, Math.min(MAX_QUESTIONS, n));
  const step = (delta: number) => {
    setCountDraft(null);
    onCount(clamp(count + delta));
  };

  const stepClass =
    "flex w-8 items-center justify-center bg-bg text-fg-soft transition-colors duration-150 hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="min-w-0">
      <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <div className="inline-flex h-9 items-stretch overflow-hidden rounded-control border border-line">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={count <= 0}
            aria-label={`Menos uma: ${label}`}
            className={stepClass}
          >
            <Minus size={13} aria-hidden />
          </button>
          <input
            inputMode="numeric"
            aria-label={label}
            value={countDraft ?? String(count)}
            onChange={(e) => {
              setCountDraft(e.target.value);
              const parsed = Number(e.target.value.replace(/\D/g, ""));
              if (!Number.isNaN(parsed)) onCount(clamp(parsed));
            }}
            onBlur={() => setCountDraft(null)}
            className="w-12 border-x border-line bg-bg text-center font-mono text-sm text-fg outline-none transition-colors focus:border-accent tabular"
          />
          <button
            type="button"
            onClick={() => step(1)}
            disabled={count >= MAX_QUESTIONS}
            aria-label={`Mais uma: ${label}`}
            className={stepClass}
          >
            <Plus size={13} aria-hidden />
          </button>
        </div>

        <span aria-hidden className="text-xs text-fg-muted">
          ×
        </span>
        <input
          inputMode="decimal"
          aria-label={`Quanto vale cada uma: ${label}`}
          value={valueDraft ?? fmtPontos(value)}
          onChange={(e) => {
            setValueDraft(e.target.value);
            const parsed = Number(e.target.value.replace(",", "."));
            if (!Number.isNaN(parsed)) onValue(Math.max(0, Math.min(MAX_POINTS, parsed)));
          }}
          onBlur={() => setValueDraft(null)}
          className="h-9 w-14 rounded-control border border-line bg-bg text-center font-mono text-sm text-fg outline-none transition-colors focus:border-accent tabular"
        />
        <span className="text-xs text-fg-muted">pts cada</span>
      </div>
      <div className="mt-1.5 text-[0.62rem] text-fg-muted">{hint}</div>
    </div>
  );
}

export function ProvaFinal({ view, onBack }: { view: SectionView; onBack: () => void }) {
  const [multipla, setMultipla] = useState(DEFAULT_MULTIPLA);
  const [valorMultipla, setValorMultipla] = useState(DEFAULT_VALOR_MULTIPLA);
  const [discursivas, setDiscursivas] = useState(DEFAULT_DISCURSIVAS);
  const [valorDiscursiva, setValorDiscursiva] = useState(DEFAULT_VALOR_DISCURSIVA);
  // Matérias fora do recorte. Guardar quem SAIU (e não quem ficou) é o que faz o
  // padrão ser "tudo entra" sem precisar semear o estado com a lista inteira.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState("");
  // Separados por aba: o formato da demo não é o formato do desafio, e trocar
  // de aba não pode fazer um texto aparecer no lugar do outro.
  const [demoComo, setDemoComo] = useState("");
  const [projeto, setProjeto] = useState("");
  const [desafioComo, setDesafioComo] = useState("");
  // Desligado por padrão: o conector é de plano pago, e prometer à IA um
  // material que ela não vai achar é pior do que não prometer.
  const [buscarNoDrive, setBuscarNoDrive] = useState(false);
  // A prova final é o padrão porque é a avaliação que assusta; demo e desafio
  // são recortes menores da mesma tela.
  const [tipo, setTipo] = useState<ExamType>("final");
  const [sprintId, setSprintId] = useState<string | null>(null);
  const [materiaId, setMateriaId] = useState<string | null>(null);
  const [aulasFora, setAulasFora] = useState<Set<string>>(() => new Set());
  const toast = useToast();

  const all = useMemo(() => buildExamSubjects(view), [view]);
  const exam = useMemo(() => findExam(view), [view]);
  const sprints = useMemo(() => buildSprints(view), [view]);

  // Sprint da demo: a corrente, deduzida da semana de hoje. O módulo anda, e
  // abrir sempre na Sprint 1 obrigaria a trocar toda vez.
  const sprintAtual = useMemo(() => {
    const semana = currentWeek(view, new Date())?.week ?? 0;
    const num = Math.ceil(semana / 2);
    return sprints.find((s) => s.num === num) ?? sprints[sprints.length - 1] ?? null;
  }, [sprints, view]);

  const sprint = sprints.find((s) => s.id === sprintId) ?? sprintAtual;
  const materia = all.find((s) => s.id === materiaId) ?? all[0] ?? null;

  // Aulas fora do desafio. Guardar quem SAIU faz o padrão ser "a matéria
  // inteira" e sobrevive à troca de matéria sem reset: os ids são de outra.
  const aulasDoDesafio = materia?.aulas.filter((a) => !aulasFora.has(a.id)) ?? [];
  const aulasSelecionadas = new Set(aulasDoDesafio.map((a) => a.id));

  /** A matéria do desafio já recortada. Os materiais seguem as semanas das
   *  aulas marcadas: material de uma semana que não cai é ruído no prompt. */
  const materiaDoDesafio: ExamSubject | null = useMemo(() => {
    if (!materia) return null;
    const parcial = aulasDoDesafio.length < materia.aulas.length;
    if (!parcial) return materia;
    const semanas = new Set(aulasDoDesafio.map((a) => a.weekNum));
    return {
      ...materia,
      aulas: aulasDoDesafio,
      materiais: materia.materiais.filter((m) => semanas.has(m.weekNum)),
    };
    // `aulasDoDesafio` é derivado de `materia` + `aulasFora` a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materia, aulasFora]);

  // O recorte de conteúdo muda com a aba: a prova final usa o que sobrou dos
  // chips, o desafio usa uma matéria recortada, e a demo não usa matéria nenhuma.
  const subjects =
    tipo === "desafio"
      ? materiaDoDesafio
        ? [materiaDoDesafio]
        : []
      : all.filter((s) => !excluded.has(s.id));
  // Pasta de materiais da turma, como o Adalove a entrega no /userdata — nada
  // de link fixo: cada turma tem a sua.
  const drive = view.section.repository;

  const format: ExamFormat = { discursivas, multipla, valorDiscursiva, valorMultipla };
  const pontos = examPoints(format);

  const totalAulas = subjects.reduce((sum, s) => sum + s.aulas.length, 0);
  const weights = subjects.map((s) => s.aulas.length);
  const porMateria = {
    discursivas: distribute(discursivas, weights),
    multipla: distribute(multipla, weights),
  };

  // 20 × 0,3 + 2 × 2,0 é a prova do Inteli — mexer nos campos é a exceção, e
  // daí o caminho de volta.
  const formatoPadrao =
    multipla === DEFAULT_MULTIPLA &&
    valorMultipla === DEFAULT_VALOR_MULTIPLA &&
    discursivas === DEFAULT_DISCURSIVAS &&
    valorDiscursiva === DEFAULT_VALOR_DISCURSIVA;

  const restaurarPadrao = () => {
    setMultipla(DEFAULT_MULTIPLA);
    setValorMultipla(DEFAULT_VALOR_MULTIPLA);
    setDiscursivas(DEFAULT_DISCURSIVAS);
    setValorDiscursiva(DEFAULT_VALOR_DISCURSIVA);
  };

  const toggleSubject = (id: string) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const selectAll = (select: boolean) =>
    setExcluded(select ? new Set() : new Set(all.map((s) => s.id)));

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
    >
      <ArrowLeft size={13} aria-hidden />
      Acadêmico
    </button>
  );

  // Título e linha de contexto acompanham a aba: na demo, falar de "prova
  // final" e de quantos dias faltam para ela seria a resposta errada na tela.
  const TipoIcon = TIPO_TABS.find((t) => t.value === tipo)?.icon ?? GraduationCap;
  const title = (
    <div>
      <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-medium text-fg">
        <TipoIcon size={20} aria-hidden className="text-accent" />
        {tipo === "demo"
          ? "Preparar a demo"
          : tipo === "desafio"
            ? "Estudar para o desafio"
            : "Estudar para a prova final"}
        {/* A tela é nova e ainda vai mudar: a tag diz isso antes de a pessoa
            descobrir sozinha, e é a mesma do anúncio na Visão geral. */}
        <Badge color="var(--color-orange)" className="tracking-[0.08em]">
          BETA
        </Badge>
      </h1>
      <p className="mt-1 text-xs text-fg-muted">
        {tipo === "demo"
          ? [view.section.caption, sprint ? `${sprint.label} · ${sprint.weeksLabel}` : null]
              .filter(Boolean)
              .join(" · ")
          : tipo === "desafio"
            ? [view.section.caption, materia ? `Desafio de ${materia.label}` : null]
                .filter(Boolean)
                .join(" · ")
            : subtitle(view, exam)}
      </p>
    </div>
  );

  // Turma sem matéria nenhuma é o fim da linha; recorte vazio NÃO é — nesse caso
  // a tela continua inteira, senão o seletor sumiria junto e não haveria como
  // desfazer o que a pessoa acabou de desmarcar.
  if (all.length === 0) {
    return (
      <div className="space-y-4">
        <Enter>{back}</Enter>
        <Enter step={1}>{title}</Enter>
        <Card className="gi-enter p-6" style={enterDelay(2)}>
          <p className="text-sm text-fg-muted">
            Nenhuma matéria com aula registrada nesta turma. A distribuição sai dos encontros por
            professor, e este módulo não tem nenhum no Adalove.
          </p>
        </Card>
      </div>
    );
  }

  const top = subjects[0];
  const topShare = top ? Math.round((top.aulas.length / totalAulas) * 100) : 0;

  // Só as oito primeiras ganham fatia própria; o resto vira uma fatia neutra.
  const shown = subjects.slice(0, MAX_SLICES);
  const rest = subjects.slice(MAX_SLICES);
  const slices: DonutSlice[] = [
    ...shown.map((s, i) => ({
      // Pelo professor, nunca pelo rótulo: dois caem em "COM" quando o nome sai
      // do eixo.
      id: s.id,
      label: s.label,
      value: s.aulas.length,
      color: SUBJECT_COLORS[i]!,
      // Sem o professor na legenda: ele mora na tabela, que é onde o detalhe
      // cabe. Aqui ele dobrava a altura de cada linha.
      // Tudo que não é a matéria com mais aula entra de apoio: o gráfico tem uma
      // pergunta só, e é essa fatia que a responde.
      dim: i > 0,
    })),
    ...(rest.length > 0
      ? [
          {
            id: "outras",
            label: `Outras ${rest.length}`,
            value: rest.reduce((sum, s) => sum + s.aulas.length, 0),
            color: "var(--color-fg-muted)",
            dim: true,
          },
        ]
      : []),
  ];

  const m = view.metrics;
  const needed = !m
    ? "—"
    : m.provaFeita
      ? "Feita"
      : m.provaStatus === "impossivel" || m.provaStatus === "folga"
        ? fmtNota(m.notaNecessariaProvaRaw)
        : fmtNota(m.notaNecessariaProva);
  const neededColor = !m
    ? undefined
    : m.provaFeita || m.provaStatus === "aprovado" || m.provaStatus === "folga"
      ? "var(--color-green)"
      : m.provaStatus === "exigente"
        ? "var(--color-yellow)"
        : "var(--color-red)";

  async function send(target: AiProvider | "copy", kind: ExamPromptKind) {
    const prompt = buildExamPrompt(
      view,
      subjects,
      format,
      {
        tipo,
        sprint: sprint ?? undefined,
        // O recorte só é "exclusão" na prova final; no desafio a matéria é
        // escolhida, não sobrou.
        excluded:
          tipo === "final" ? all.filter((s) => excluded.has(s.id)).map((s) => s.label) : undefined,
        notes,
        howItWorks: tipo === "demo" ? demoComo : tipo === "desafio" ? desafioComo : undefined,
        project: tipo === "demo" ? projeto : undefined,
        driveSearch: buscarNoDrive,
      },
      kind,
    );
    const noun = kind === "simulado" ? "A prova" : "O plano";

    if (target === "copy") {
      const copied = await copyText(prompt);
      toast.toast(
        copied ? `${noun}: prompt copiado.` : "Não consegui copiar.",
        copied ? "success" : "error",
      );
      return;
    }

    // O prompt leva o conteúdo de todas as matérias e passa fácil do teto de
    // URL; nesse caso vai pelo clipboard, senão o destino truncaria em silêncio.
    if (!target.supportsPrefill || prompt.length > MAX_URL_PROMPT_CHARS) {
      const copied = await copyText(prompt);
      window.open(target.buildUrl(prompt), "_blank", "noopener,noreferrer");
      toast.toast(
        copied
          ? `${noun}: prompt copiado. Cole no ${target.label}.`
          : `Não consegui copiar. Abra o ${target.label} e peça de novo por aqui.`,
        copied ? "success" : "error",
      );
      return;
    }
    window.open(target.buildUrl(prompt), "_blank", "noopener,noreferrer");
  }

  /** As duas fileiras de botões são iguais em tudo menos no prompt que mandam —
   *  então é o mesmo componente, com o tipo como parâmetro. */
  function PromptButtons({ kind, disabled }: { kind: ExamPromptKind; disabled: boolean }) {
    const base =
      "inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-medium transition-colors duration-150 hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line";

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {AI_PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => void send(p, kind)}
            className={cn(base, "text-fg-soft disabled:hover:text-fg-soft")}
          >
            <Logo name={p.logo} size={15} />
            {p.label}
            {/* Abre outro app, em outra aba. */}
            <ExternalLink size={11} aria-hidden className="text-fg-muted" />
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => void send("copy", kind)}
          className={cn(base, "text-fg-muted")}
        >
          <ClipboardCopy size={13} aria-hidden />
          Copiar prompt
        </button>
      </div>
    );
  }

  const totalQuestoes = discursivas + multipla;
  // Sem conteúdo não há prompt: a demo precisa de sprint, as outras de matéria.
  const semRecorte = tipo === "demo" ? !sprint : subjects.length === 0;

  return (
    <div className="space-y-6">
      <Enter>{back}</Enter>

      <Enter step={1}>
        {title}
        {/* Três avaliações, uma tela: a aba troca o recorte de conteúdo e os
            pedidos, não o layout inteiro. */}
        <Tabs
          className="mt-3"
          options={TIPO_TABS}
          value={tipo}
          onChange={setTipo}
        />
      </Enter>

      {/* A contagem e o anel são da PROVA FINAL: ela é a única avaliação com
          data no Adalove e a única espalhada por várias matérias. Demo e
          desafio abrem direto no que precisam escolher. */}
      {tipo === "final" ? (
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[19rem_1fr]">
          <Enter step={2} className="min-w-0 lg:self-start">
            <ProvaCountdown
              exam={exam}
              view={view}
              needed={needed}
              neededColor={neededColor}
              neededHint={
                m?.provaFeita
                  ? "a prova já foi lançada"
                  : "para o objetivo do simulador na Visão geral"
              }
            />
          </Enter>

          {/* Encostado na direita e com a legenda justa: o bloco inteiro (título,
              anel, legenda e leitura) vive numa medida só, alinhada com a borda
              dos cartões de baixo. Solto, a legenda esticava com a coluna e os
              números paravam longe do nome da matéria. */}
          <Enter step={2} className="min-w-0 lg:ml-auto lg:w-full lg:max-w-lg">
            <CardTitle>Distribuição das aulas</CardTitle>
            {top ? (
              <>
                <div className="mt-4">
                  <Donut
                    slices={slices}
                    size={200}
                    dense
                    center={{ value: `${topShare}%`, label: top.label }}
                  />
                </div>
                <p className="mt-4 text-sm text-fg">{headline(subjects, totalAulas)}</p>
                <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-muted">
                  Estimativa pelo tempo de aula, não gabarito: o Adalove não publica o conteúdo da
                  prova.
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-fg-muted">
                Nenhuma matéria no recorte. Marque o conteúdo que cai na prova para ver a
                distribuição.
              </p>
            )}
          </Enter>
        </div>
      ) : (
        <Enter step={2} className="min-w-0">
          {tipo === "demo" ? (
            <DemoSprint sprints={sprints} sprint={sprint} onSprint={setSprintId} />
          ) : (
            <DesafioMateria
              subjects={all}
              materia={materia}
              onMateria={setMateriaId}
              aulas={materia?.aulas ?? []}
              selecionadas={aulasSelecionadas}
              onToggleAula={(id) =>
                setAulasFora((current) => {
                  const next = new Set(current);
                  if (!next.delete(id)) next.add(id);
                  return next;
                })
              }
              onAllAulas={(select) =>
                setAulasFora((current) => {
                  const next = new Set(current);
                  for (const a of materia?.aulas ?? []) {
                    if (select) next.delete(a.id);
                    else next.add(a.id);
                  }
                  return next;
                })
              }
            />
          )}
        </Enter>
      )}

      {/* A demo não tem questão para contar: o cartão de formato sai inteiro. */}
      {tipo !== "demo" && (
      <Card className="gi-enter p-4" style={enterDelay(6)}>
        {/* O total mora no cabeçalho, não no fim da fileira de campos: é
            conferência ("bateu 10 pontos?"), e ali ele não se perde quando os
            campos quebram de linha em tela estreita. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <CardTitle>{tipo === "desafio" ? "Formato do desafio" : "Formato da prova"}</CardTitle>
          <span className="flex items-baseline gap-3">
            {/* O formato do Inteli é sempre o mesmo; o caminho de volta existe
                para quem mexeu nos campos para simular outra coisa. */}
            {!formatoPadrao && (
              <button
                type="button"
                onClick={restaurarPadrao}
                className="text-[0.62rem] text-accent transition-opacity hover:opacity-80"
              >
                voltar ao padrão
              </button>
            )}
            <span className="font-mono text-[0.68rem] text-fg-muted tabular">
              <span className="text-sm font-medium text-fg">{fmtPontos(pontos.total)}</span> pts ·{" "}
              {totalQuestoes} {totalQuestoes === 1 ? "questão" : "questões"}
            </span>
          </span>
        </div>

        {/* Múltipla escolha primeiro: é a maior parte da prova em número de
            questões, e é por ela que a pessoa começa a contar. */}
        <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-4">
          <QuestionField
            label="Questões de múltipla escolha"
            hint="alternativas, uma correta"
            count={multipla}
            onCount={setMultipla}
            value={valorMultipla}
            onValue={setValorMultipla}
          />
          <QuestionField
            label="Questões discursivas"
            hint="escrita livre, uma resposta por questão"
            count={discursivas}
            onCount={setDiscursivas}
            value={valorDiscursiva}
            onValue={setValorDiscursiva}
          />
        </div>

        {/* O desafio já escolheu a matéria no seletor lá de cima: aqui não há
            recorte a fazer, nem distribuição entre matérias para mostrar. */}
        {tipo === "final" && (
          <div className="mt-5 border-t border-line-soft pt-4">
            <SubjectPicker
              subjects={all}
              excluded={excluded}
              onToggle={toggleSubject}
              onAll={selectAll}
            />
          </div>
        )}

        {tipo === "final" && subjects.length > 0 && (
        <TableContainer className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Matéria</Th>
                <Th className="w-20 text-right">Aulas</Th>
                <Th className="w-16 text-right">Peso</Th>
                {/* Sem questões declaradas as colunas seriam uma parede de
                    traços: a tabela vira só a régua de aulas. */}
                {totalQuestoes > 0 && (
                  <>
                    <Th className="w-32 text-right">Múltipla escolha</Th>
                    <Th className="w-28 text-right">Discursivas</Th>
                    <Th className="w-24 text-right">Pontos</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => {
                const share = Math.round((s.aulas.length / totalAulas) * 100);
                const d = porMateria.discursivas[i] ?? 0;
                const mc = porMateria.multipla[i] ?? 0;
                return (
                  <tr key={s.id} className={cn(i === 0 && "bg-surface-hover")}>
                    <Td className="text-xs">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            background: SUBJECT_COLORS[i] ?? "var(--color-fg-muted)",
                            opacity: i === 0 ? 1 : 0.55,
                          }}
                        />
                        <span className="min-w-0">
                          <span className={cn("block truncate", i === 0 && "font-medium")}>
                            {s.label}
                          </span>
                          {s.professor && (
                            <span className="block truncate text-[0.58rem] text-fg-muted">
                              {s.professor}
                            </span>
                          )}
                        </span>
                      </span>
                    </Td>
                    <Td className="text-right font-mono text-xs tabular">{s.aulas.length}</Td>
                    <Td className="text-right font-mono text-xs text-fg-muted tabular">{share}%</Td>
                    {totalQuestoes > 0 && (
                      <>
                        <Td className="text-right font-mono text-xs tabular">
                          {mc > 0 ? mc : <span className="text-fg-muted">—</span>}
                        </Td>
                        <Td className="text-right font-mono text-xs tabular">
                          {d > 0 ? d : <span className="text-fg-muted">—</span>}
                        </Td>
                        {/* A coluna que decide onde estudar: questão de
                            discursiva vale várias de múltipla escolha, então
                            contagem sozinha engana. */}
                        <Td
                          className={cn(
                            "text-right font-mono text-xs tabular",
                            i === 0 ? "text-fg" : "text-fg-soft",
                          )}
                        >
                          {fmtPontos(mc * valorMultipla + d * valorDiscursiva)}
                        </Td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableContainer>
        )}
      </Card>
      )}

      {/* O que só o aluno sabe. Na prova final é recado solto; na demo e no
          desafio é a FONTE do formato, porque o Adalove não diz nada sobre eles
          e o prompt se recusa a inventar. */}
      {tipo === "final" ? (
        <TextCard
          step={7}
          title="Observações"
          optional
          value={notes}
          onChange={setNotes}
          max={MAX_NOTES}
          rows={3}
          placeholder="O que a IA precisa saber e a tela não sabe: o professor avisou o que cai, onde você trava, se a prova é sem consulta…"
        />
      ) : (
        <>
          <TextCard
            step={7}
            title={tipo === "demo" ? "Como funciona a demo" : "Como funciona o desafio"}
            hint={
              tipo === "demo"
                ? "Sem isto a IA não sabe o formato e vai perguntar em vez de supor — o Adalove não diz nada sobre a demo."
                : "Sem isto a IA não sabe o formato e vai perguntar em vez de supor — o Adalove só diz que o desafio existe."
            }
            value={tipo === "demo" ? demoComo : desafioComo}
            onChange={tipo === "demo" ? setDemoComo : setDesafioComo}
            max={MAX_NOTES}
            rows={4}
            placeholder={
              tipo === "demo"
                ? "Quem assiste, quanto tempo temos, se tem perguntas no fim, o que os professores costumam cobrar, o que já foi dito que precisa aparecer…"
                : "Individual ou em grupo, com ou sem consulta, quanto tempo, que tipo de questão o professor costuma cobrar…"
            }
          />

          {tipo === "demo" && (
            <TextCard
              step={7}
              title="O projeto do grupo"
              optional
              value={projeto}
              onChange={setProjeto}
              max={MAX_PROJECT}
              rows={4}
              placeholder="O que o grupo está construindo, para quem, em que ponto está e o que você fez nesta sprint. É sobre isso que a demo é."
            />
          )}
        </>
      )}

      {/* O material vale para os dois prompts, então vem antes deles e fora dos
          cartões — é um ajuste do que vai junto, não um terceiro pedido. */}
      <Enter step={8}>
        <CardTitle>Material das aulas</CardTitle>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Switch
            checked={buscarNoDrive}
            onChange={setBuscarNoDrive}
            label="Tenho o Google Drive conectado na IA que vou usar"
          />
          {drive && (
            <a
              href={drive}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-xs font-medium text-fg-soft transition-colors duration-150 hover:border-accent hover:text-fg"
            >
              <Logo name="drive" size={14} />
              Drive da turma
              <ExternalLink size={11} aria-hidden className="text-fg-muted" />
            </a>
          )}
        </div>

        {/* Os dois lados do interruptor dizem o que muda no prompt — ligado, a
            IA vai atrás dos slides; desligado, ela só tem os títulos, e isso
            precisa estar escrito para o plano raso não parecer o plano bom. */}
        <p className="mt-2 text-[0.62rem] leading-relaxed text-fg-muted">
          {buscarNoDrive
            ? "O prompt manda a IA abrir a pasta da turma e puxar os slides das aulas antes de responder."
            : "Sem isso a IA recebe só os títulos das aulas, sem o conteúdo de nenhum slide: o plano sai bem mais raso."}
        </p>
      </Enter>

      {/* Dois pedidos, dois cartões: são momentos diferentes do estudo, e num
          card só a pessoa mandava um e nem via o outro. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gi-enter p-4" style={enterDelay(9)}>
          <CardTitle>{PROMPT_CARDS[tipo].simulado.title}</CardTitle>
          <p className="mt-2 text-xs text-fg-soft">
            {PROMPT_CARDS[tipo].simulado.hint(totalQuestoes)}
          </p>
          <PromptButtons kind="simulado" disabled={semRecorte || (tipo !== "demo" && totalQuestoes === 0)} />
          {tipo !== "demo" && totalQuestoes === 0 && (
            <p className="mt-3 text-[0.62rem] text-fg-muted">
              Declare as questões no formato acima para gerar o simulado.
            </p>
          )}
        </Card>

        <Card className="gi-enter p-4" style={enterDelay(10)}>
          <CardTitle>{PROMPT_CARDS[tipo].plano.title}</CardTitle>
          <p className="mt-2 text-xs text-fg-soft">{PROMPT_CARDS[tipo].plano.hint(totalQuestoes)}</p>
          <PromptButtons kind="plano" disabled={semRecorte} />
        </Card>
      </div>

      <p className="gi-enter text-[0.62rem] text-fg-muted" style={enterDelay(10)}>
        {semRecorte
          ? tipo === "demo"
            ? "Escolha a sprint da demo."
            : "Marque ao menos uma matéria no conteúdo."
          : "Os dois prompts vão pela área de transferência quando passam do limite da URL, porque o destino truncaria em silêncio."}
      </p>
    </div>
  );
}

/** Linha de contexto embaixo do título: que turma é, que prova é e quando. */
function subtitle(view: SectionView, exam: ReturnType<typeof findExam>): string {
  const parts: string[] = [view.section.caption];
  if (exam) {
    const when = formatDate(exam.date);
    const days = daysUntil(exam.date);
    parts.push(
      [
        exam.caption,
        when,
        days !== null && days > 0
          ? `em ${plural(days, "dia", "dias")}`
          : days === 0
            ? "é hoje"
            : null,
        // "do módulo" não é redundante: o card do formato fala em pontos DA
        // PROVA (10), e sem a qualificação os dois números brigam na mesma tela.
        exam.weight > 0 ? `vale ${plural(exam.weight, "ponto", "pontos")} do módulo` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }
  return parts.join(" · ");
}
