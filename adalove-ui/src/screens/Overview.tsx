import {
  CalendarDays,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  LayoutGrid,
  Table2,
  UserRoundX,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { attendanceUnits } from "@/lib/attendance-parser";
import { fmtNota } from "@/lib/format";
import { CATEGORY_COLOR } from "~/data/activityTypes";
import type {
  MetricasModulo,
  ParticipacaoLetra,
  ParticipacaoMultipliers,
  SimulacaoConfig,
} from "@/types/grades";
import type { NewsItem } from "~/data/news";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { buildSubjects } from "~/ai/summary";
import { AI_BUTTON_CLASS, SummaryButton } from "~/ai/SummaryButton";
import { cn } from "~/lib/cn";
import { InteliSymbol } from "~/lib/logos";
import { getPref, setPref } from "~/lib/prefs";
import { GitlabButton, GithubStarButton, SlackButton, ThemeToggle, type Theme } from "~/shell/HeaderActions";
import { ModuleProgress } from "~/shell/ModuleProgress";
import { NextScored } from "~/shell/NextScored";
import { Calendario } from "~/screens/Calendario";
import { NotificationsButton } from "~/screens/Notificacoes";
import { Faltas } from "~/screens/Faltas";
import { Notas } from "~/screens/Notas";
import { SectionCards } from "~/screens/SectionCards";
import { Simulador } from "~/screens/Simulador";
import { WeeksOverview } from "~/screens/WeeksOverview";
import { Badge } from "~/ui/Badge";
import { Card, CardTitle } from "~/ui/Card";
import { Donut } from "~/ui/Donut";
import { Tooltip } from "~/ui/Tooltip";
import { Tabs } from "~/ui/Tabs";
import { SHORTCUT_CLASS, shortcut as cardShortcut, stopCardClick } from "~/ui/shortcut";

// Os cards do topo são atalhos para a aba que detalha o número deles: nota vai
// para Notas, falta vai para Faltas. É o gesto que o aluno já tenta. A mecânica
// (classe + teclado) mora em ~/ui/shortcut, compartilhada com os cards da turma.
function shortcut(label: string, onOpen?: () => void) {
  return cardShortcut(`Ver ${label} na aba ${label === "Faltas" ? "Faltas" : "Notas"}`, onOpen);
}

function MetricCard({
  label,
  value,
  hint,
  accent,
  onOpen,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  onOpen?: () => void;
}) {
  return (
    <Card
      className={cn("px-4 py-3", onOpen && SHORTCUT_CLASS)}
      style={accent ? { borderTop: `2px solid ${accent}` } : undefined}
      {...shortcut(label, onOpen)}
    >
      <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-medium tracking-tight text-fg tabular">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[0.62rem] text-fg-muted">{hint}</div>}
    </Card>
  );
}

function DualCard({
  label,
  accumulated,
  average,
  color,
  onOpen,
}: {
  label: string;
  accumulated: number;
  average: number | null;
  color: string;
  onOpen?: () => void;
}) {
  return (
    <Card
      className={cn("px-4 py-3", onOpen && SHORTCUT_CLASS)}
      style={{ borderTop: `2px solid ${color}` }}
      {...shortcut(label, onOpen)}
    >
      <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
        {label}
      </div>
      <div className="mt-2 flex items-end gap-3">
        <div className="min-w-0">
          <div className="font-mono text-lg font-medium tracking-tight text-fg tabular">
            {accumulated.toFixed(2)}
          </div>
          <div className="text-[0.55rem] uppercase tracking-[0.04em] text-fg-muted">
            Acumulado
          </div>
        </div>
        <div className="h-8 w-px shrink-0 bg-line" />
        <div className="min-w-0">
          <div className="font-mono text-lg font-medium tracking-tight text-fg tabular">
            {fmtNota(average)}
          </div>
          <div className="text-[0.55rem] uppercase tracking-[0.04em] text-fg-muted">
            Até o momento
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Onde fica guardado que a pessoa já fechou o anúncio. */
const BANNER_PREF = "prova-banner";

/** Faixa de anúncio da tela de prova, na primeira linha da Visão geral.
 *
 *  É temporária: existe enquanto a função for novidade, porque um botão no pé
 *  da página não é encontrado por quem não estava procurando. Laranja para não
 *  se confundir com o resto da tela, fina, e o cartão inteiro é o alvo do
 *  clique. Quem fechar não vê de novo: a escolha vai para o storage da
 *  extensão, como as outras preferências.
 *
 *  Para remover a campanha, apague o componente e a chamada dele. */
function ProvaFinalBanner({ onOpen }: { onOpen: () => void }) {
  // Nasce escondida e só aparece depois de ler a preferência: o contrário
  // mostraria por um instante um anúncio que a pessoa já dispensou.
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPref(BANNER_PREF).then((value) => {
      if (alive && value !== "off") setShow(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  return (
    <Card
      className={cn(
        "group flex cursor-pointer items-center gap-3 border-orange/40 bg-orange/[0.07] px-4 py-2.5",
        "transition-colors duration-150 hover:bg-orange/[0.13] focus-visible:border-orange focus-visible:outline-none",
      )}
      {...cardShortcut("Abrir a preparação para a prova", onOpen)}
    >
      <GraduationCap size={16} aria-hidden className="shrink-0 text-orange" />
      <Badge color="var(--color-orange)" className="shrink-0 tracking-[0.08em]">
        BETA
      </Badge>
      <p className="min-w-0 flex-1 text-xs text-fg-soft">
        <span className="font-medium text-fg">Novo: estudar para a prova.</span> Simulado no formato
        do Inteli, plano de estudo e preparação de demo e desafio, com o conteúdo do seu módulo.
      </p>
      <ChevronRight
        size={14}
        aria-hidden
        className="shrink-0 text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5"
      />
      {/* O X é um alvo dentro de um alvo: sem parar a propagação, fechar o
          anúncio abriria a tela junto. */}
      <button
        type="button"
        aria-label="Dispensar o aviso"
        onClick={(e) => {
          stopCardClick(e);
          setShow(false);
          void setPref(BANNER_PREF, "off");
        }}
        className="-mr-1 shrink-0 rounded p-1 text-fg-muted transition-colors hover:text-fg"
      >
        <X size={14} aria-hidden />
      </button>
    </Card>
  );
}

function ProgressBars({ view }: { view: SectionView }) {
  const rows = Object.entries(view.metrics?.pesosPorTipo ?? {})
    .filter(([, peso]) => peso > 0)
    .map(([tipo, peso]) => {
      const items = view.items.filter((i) => i.tipo === tipo);
      const graded = items.filter((i) => i.nota !== null).length;
      return {
        tipo,
        peso,
        graded,
        total: items.length,
        ratio: items.length ? graded / items.length : 0,
      };
    });

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.tipo}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-fg-soft">{row.tipo}</span>
            <span className="shrink-0 font-mono text-[0.65rem] text-fg-muted tabular">
              {row.graded}/{row.total}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-[3px] bg-line-soft">
            <div
              className="h-full rounded-[3px] transition-[width] duration-500"
              style={{
                width: `${row.ratio * 100}%`,
                background: CATEGORY_COLOR[row.tipo] ?? "var(--color-accent)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Uma linha fina por matéria: quantos encontros já aconteceram (qualquer slot
 *  fora de "futuro") das aulas previstas. Reaproveita o agrupamento por
 *  professor de `buildSubjects` — é o mesmo "matéria" usado no resumo por IA,
 *  já que o /userdata não tem esse campo de verdade. */
function SubjectsAttendance({ view }: { view: SectionView }) {
  const rows = buildSubjects(view)
    .map((s) => {
      const encontros = s.activities.filter((a) => a.attendance.length > 0);
      const happened = encontros.filter((a) =>
        a.attendance.some((slot) => slot.status !== "futuro"),
      ).length;
      return { id: s.id, label: s.label, happened, total: encontros.length };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  if (!rows.length) return null;

  return (
    <Card className="p-4">
      <CardTitle>Aulas por matéria</CardTitle>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
        {rows.map((r) => (
          // Chave pelo professor, nunca pelo label: dois professores caem no
          // mesmo rótulo sempre que `derivedLabel` usa o eixo (vira "COM" duas
          // vezes). Com chave repetida o React reaproveita o nó da primeira
          // ocorrência — a lista sai fora do sort e uma linha do módulo
          // anterior sobrevive à troca de turma.
          <div key={r.id} className="flex min-w-36 flex-1 items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-xs text-fg-soft">{r.label}</span>
            <span className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-line-soft">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${(r.happened / r.total) * 100}%` }}
              />
            </span>
            <span className="shrink-0 font-mono text-[0.62rem] text-fg-muted tabular">
              {r.happened}/{r.total}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Formulário de revisão de faltas no portal de atendimento do Inteli. */
const ATTENDANCE_REVIEW_URL = "https://help.inteli.edu.br/support/catalog/items/289";

function AttendanceCard({ view, onOpen }: { view: SectionView; onOpen?: () => void }) {
  const a = view.attendance;
  if (!a) {
    return (
      <Card className="p-4">
        <CardTitle>Faltas</CardTitle>
        <p className="mt-2 text-xs text-fg-muted">Sem dados de presença nesta turma.</p>
      </Card>
    );
  }
  const danger = a.percentFaltas >= 20;
  const warn = a.percentFaltas >= 15;
  // Totais em horas-aula; `u` traduz para chamadas quando a turma tem peso único.
  const u = attendanceUnits(a);
  return (
    <Card
      className={cn("p-4", onOpen && SHORTCUT_CLASS)}
      style={{
        borderTop: `2px solid ${
          danger ? "var(--color-red)" : warn ? "var(--color-yellow)" : "var(--color-green)"
        }`,
      }}
      {...shortcut("Faltas", onOpen)}
    >
      <div className="flex items-start justify-between gap-2">
        <CardTitle>Faltas</CardTitle>
        {/* O item 289 do catálogo é o formulário de revisão de faltas; a home do
            portal fica como destino de reserva se ele sair do ar ou mudar. */}
        <Tooltip label="Abrir chamado de revisão de faltas">
          <a
            href={ATTENDANCE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Solicitar revisão de faltas no portal de atendimento"
            // O card virou atalho para a aba Faltas; sem isto, clicar em
            // "Revisar" abriria o portal E trocaria a aba por baixo.
            onClick={(e) => e.stopPropagation()}
            className="-mt-0.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-[0.68rem] font-medium text-fg-soft transition-colors duration-150 hover:border-accent hover:text-fg"
          >
            Revisar
            <ExternalLink size={11} aria-hidden />
          </a>
        </Tooltip>
      </div>
      <div className="mt-2 flex items-end gap-3">
        <span className="font-mono text-2xl font-medium tracking-tight text-fg tabular">
          {a.percentFaltas.toFixed(2)}%
        </span>
        <span className="pb-1 text-xs text-fg-muted">
          de {u.fmt(a.totalUnits)} {u.unidade}
        </span>
      </div>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-[3px] bg-line">
        <div
          className="h-full bg-green"
          style={{ width: `${(a.presentes / a.totalUnits) * 100}%` }}
        />
        <div
          className="h-full bg-blue"
          style={{ width: `${(a.justificados / a.totalUnits) * 100}%` }}
        />
        <div className="h-full bg-red" style={{ width: `${(a.faltas / a.totalUnits) * 100}%` }} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-soft">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: "#2FAA5C" }} />
          Presente <span className="font-mono text-fg tabular">{u.fmt(a.presentes)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: "#0777DB" }} />
          Justificado <span className="font-mono text-fg tabular">{u.fmt(a.justificados)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: "#F05086" }} />
          Faltas <span className="font-mono text-fg tabular">{u.fmt(a.faltas)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: "#B3B3C3" }} />
          A avaliar <span className="font-mono text-fg tabular">{u.fmt(a.futuros)}</span>
        </span>
      </div>
      <p className="mt-3 text-xs text-fg-soft">
        Restam <span className="font-mono text-fg tabular">{u.fmt(a.faltasRestantes)}</span> de{" "}
        <span className="font-mono tabular">{u.fmt(a.maxFaltasAllowed)}</span> faltas permitidas.
      </p>
    </Card>
  );
}

type OverviewTab = "atividades" | "calendario" | "notas" | "faltas";

export function Overview({
  view,
  onOpenWeek,
  onOpenActivity,
  onSeeStudents,
  onProvaFinal,
  news,
  newsLoading,
  theme,
  onTheme,
  superTech,
  onSuperTech,
  simulacao,
  onSimulacao,
  participacao,
  onParticipacao,
  multipliers,
  onMultipliers,
  onSelectSection,
  switchingSection,
}: {
  view: SectionView;
  onOpenWeek?: (week: string) => void;
  onOpenActivity: (activity: ActivityView) => void;
  onSeeStudents?: () => void;
  /** Abre a preparação para a prova final — tela inteira, como o kanban e o
   *  grupo: é outra pergunta, e dividir a atenção com o dashboard do módulo
   *  tiraria dela o pouco de foco que ela pede. */
  onProvaFinal: () => void;
  news: NewsItem[] | null;
  newsLoading?: boolean;
  theme: Theme;
  onTheme: (t: Theme) => void;
  superTech: boolean;
  onSuperTech: (on: boolean) => void;
  simulacao: SimulacaoConfig;
  onSimulacao: (s: SimulacaoConfig) => void;
  participacao: ParticipacaoLetra;
  onParticipacao: (p: ParticipacaoLetra) => void;
  multipliers: ParticipacaoMultipliers;
  onMultipliers: (m: ParticipacaoMultipliers) => void;
  /** Troca a turma carregada — o seletor mora no indicador de módulo. */
  onSelectSection?: (uuid: string) => void;
  switchingSection?: string | null;
}) {
  const [tab, setTab] = useState<OverviewTab>("atividades");
  const tabsRef = useRef<HTMLDivElement>(null);
  const m = view.metrics;

  // Trocar a aba não basta: a barra de abas fica bem abaixo dos cards, então sem
  // rolar até ela o clique pareceria não ter feito nada.
  function openTab(next: OverviewTab) {
    setTab(next);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const openNotas = () => openTab("notas");
  const openFaltas = () => openTab("faltas");

  if (!m) {
    return (
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-medium text-fg">
          <InteliSymbol size={26} />
          Adalove
        </h1>
        <Card className="p-6">
          <p className="text-sm text-fg-muted">
            Nenhuma atividade avaliada nesta turma ainda. As abas Atividades e Faltas continuam
            funcionando.
          </p>
        </Card>
        <WeeksOverview view={view} onOpenWeek={onOpenWeek} />
        <SectionCards
          view={view}
          news={news}
          newsLoading={newsLoading}
          onSeeStudents={onSeeStudents}
        />
      </div>
    );
  }

  const slices = [
    { label: "Ponderadas", value: m.pesosPorTipo.Ponderada ?? 0, color: CATEGORY_COLOR.Ponderada! },
    { label: "Artefatos", value: m.pesosPorTipo.Artefato ?? 0, color: CATEGORY_COLOR.Artefato! },
    {
      label: "Autoavaliação",
      value: m.pesosPorTipo["Autoavaliação"] ?? 0,
      color: CATEGORY_COLOR["Autoavaliação"]!,
    },
    { label: "Prova", value: m.pesosPorTipo.Prova ?? 0, color: CATEGORY_COLOR.Prova! },
    { label: "Grupo", value: m.pesosPorTipo.Grupo ?? 0, color: CATEGORY_COLOR.Grupo! },
  ].filter((s) => s.value > 0);
  const totalPeso = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-4">
      {/* Antes de tudo, inclusive do cabeçalho: é anúncio, e anúncio que começa
          no meio da página não é visto. */}
      <ProvaFinalBanner onOpen={onProvaFinal} />

      {/* `min-h-12` dá folga acima e abaixo do item mais alto (os botões, 36px):
          sem ela a régua encostava nas duas bordas da faixa e o conjunto lia
          como esticado em vez de centrado.

          `mb-6` e não `pb-*`: padding entraria na conta do `min-h-12` e
          desalinharia o que acabou de ser centrado. A margem colapsa com o
          `mt-4` que o `space-y-4` do pai põe no primeiro cartão, então o vão
          entre a faixa e a grade de notas fica nos 24px da maior das duas. */}
      <div className="mb-6 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-medium text-fg">
          <InteliSymbol size={26} />
          Adalove
        </h1>
        <ModuleProgress
          view={view}
          onSelectSection={onSelectSection}
          switchingTo={switchingSection}
        />
        <NextScored view={view} onOpen={onOpenActivity} />
        <div className="ml-auto flex items-center gap-2">
          <SlackButton />
          <GitlabButton />
          <GithubStarButton />
          <ThemeToggle
            theme={theme}
            onChange={onTheme}
            superTech={superTech}
            onSuperTech={onSuperTech}
          />
          <NotificationsButton view={view} onOpenActivity={onOpenActivity} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          label="Total acumulado"
          value={m.acumuladoTotal.toFixed(2)}
          hint={`${Math.round(m.pontosAvaliados * 100)} de ${Math.round(
            (m.pontosAvaliados + m.pontosNaoAvaliados) * 100,
          )} pontos já avaliados`}
          accent="var(--color-accent)"
          onOpen={openNotas}
        />
        <MetricCard
          label="Média até o momento"
          value={fmtNota(m.mediaTotalAteOMomento)}
          hint={`${Math.round(m.pontosNaoAvaliados * 100)} pontos ainda por avaliar`}
          onOpen={openNotas}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DualCard
          label="Ponderadas"
          accumulated={m.acumuladoPonderadas}
          average={m.mediaPonderadasAteOMomento}
          color={CATEGORY_COLOR.Ponderada!}
          onOpen={openNotas}
        />
        <DualCard
          label="Artefatos"
          accumulated={m.acumuladoArtefatos}
          average={m.mediaArtefatosAteOMomento}
          color={CATEGORY_COLOR.Artefato!}
          onOpen={openNotas}
        />
        {/* Só as turmas que têm a categoria (2º ano) veem o card: em GRAD CC o
            peso é zero e sobraria um card vazio na grade. */}
        {(m.pesosPorTipo["Autoavaliação"] ?? 0) > 0 && (
          <DualCard
            label="Autoavaliação"
            accumulated={m.acumuladoAutoavaliacao}
            average={m.mediaAutoavaliacaoAteOMomento}
            color={CATEGORY_COLOR["Autoavaliação"]!}
            onOpen={openNotas}
          />
        )}
        <DualCard
          label="Prova"
          accumulated={m.acumuladoProva}
          average={m.mediaProvaAteOMomento}
          color={CATEGORY_COLOR.Prova!}
          onOpen={openNotas}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className={cn("p-4", SHORTCUT_CLASS)} {...shortcut("Distribuição do peso", openNotas)}>
          <CardTitle>Distribuição do peso</CardTitle>
          <div className="mt-3 grid gap-5 sm:grid-cols-[auto_1fr]">
            {/* Pontos, não percentual: o módulo do fixture soma 102, então "% do
                total" mostraria 102% e pareceria bug. A escala real é em pontos. */}
            <Donut
              slices={slices}
              center={{ value: String(Math.round(totalPeso * 100)), label: "pontos" }}
              formatValue={(v) => String(Math.round(v * 100))}
            />
            <div className="min-w-0 border-line sm:border-l sm:pl-5">
              <ProgressBars view={view} />
            </div>
          </div>
        </Card>
        <AttendanceCard view={view} onOpen={openFaltas} />
      </div>

      <SubjectsAttendance view={view} />

      <Simulador
        metrics={m as MetricasModulo}
        simulacao={simulacao}
        onSimulacao={onSimulacao}
        participacao={participacao}
        onParticipacao={onParticipacao}
        multipliers={multipliers}
        onMultipliers={onMultipliers}
      />

      {/* Mesmo agrupamento da barra de abas do Adalove, na ordem que o aluno usa. */}
      <div ref={tabsRef} className="flex flex-wrap items-center gap-3 pt-1">
        <Tabs
          options={[
            { label: "Minhas atividades", value: "atividades", icon: LayoutGrid },
            { label: "Calendário", value: "calendario", icon: CalendarDays },
            { label: "Notas", value: "notas", icon: Table2 },
            { label: "Faltas", value: "faltas", icon: UserRoundX },
          ]}
          value={tab}
          onChange={setTab}
        />
        {/* À esquerda do resumo: os dois falam com IA, mas este é o que tem
            hora marcada — e, no fim do módulo, é o primeiro que se procura.
            A classe é a MESMA do botão do resumo (ver ~/ai/SummaryButton), para
            os dois serem o mesmo objeto na fileira e não dois parecidos. */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onProvaFinal}
            className={AI_BUTTON_CLASS}
          >
            <GraduationCap size={14} aria-hidden />
            Estudar para prova
          </button>
          <SummaryButton view={view} />
        </div>
      </div>

      {tab === "atividades" && <WeeksOverview view={view} onOpenWeek={onOpenWeek} />}
      {tab === "calendario" && (
        <Calendario view={view} onOpen={onOpenActivity} onOpenWeek={onOpenWeek} />
      )}
      {tab === "notas" && <Notas view={view} onOpen={onOpenActivity} showHeader={false} />}
      {tab === "faltas" && <Faltas view={view} showHeader={false} />}

      <hr className="border-0 border-t border-line" />

      <SectionCards
        view={view}
        news={news}
        newsLoading={newsLoading}
        onSeeStudents={onSeeStudents}
      />
    </div>
  );
}
