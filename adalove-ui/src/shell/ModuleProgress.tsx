import { Check, ChevronDown, Loader2, Lock, LockOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "~/data/api";
import { currentWeek } from "~/data/schedule";
import type { SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { formatDate } from "~/lib/date";
import { Skeleton } from "~/ui/Skeleton";
import { Tooltip } from "~/ui/Tooltip";

// O número do módulo NÃO sai do caption da turma: "T11" é o nome da turma e é o
// mesmo desde o primeiro módulo. Sai do currículo, em
// GET /student-curriculums/student-record — o mesmo payload da tela de Histórico.
//
// Também não dá para calcular por aritmética de ano/semestre: o registro deste
// aluno vai do CC09 direto para o CC11, sem CC10. Qualquer `(ano-1)*2+semestre`
// erraria em silêncio, que é o pior tipo de erro para um número exibido.

interface RecordModule {
  code?: string | null;
  caption?: string | null;
  status?: string | null;
  startDate?: string | null;
}

interface StudentRecord {
  programs?: { modules?: RecordModule[] }[];
}

/** Uma linha de `GET /sections`: a mesma lista que o modal "Turmas" do Adalove
 *  mostra, já com o status (aberta/fechada) de cada uma. */
interface SectionRow {
  uuid: string;
  caption: string | null;
  display_caption?: string | null;
  date?: string | null;
  status?: string | null;
  profile?: string | null;
  projectCaption?: string | null;
  orientation?: string | null;
}

function isApproved(status: string | null | undefined) {
  return (status ?? "").toUpperCase().startsWith("APROV");
}

/** O número vem do caption ("Módulo 11: …"); o `code` ("GRAD CC11") é a rede de
 *  segurança para quando o caption vier vazio. */
function moduleNumber(m: RecordModule): number | null {
  const raw = /(\d{1,2})/.exec(m.caption ?? "")?.[1] ?? /(\d{1,2})\s*$/.exec(m.code ?? "")?.[1];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** O módulo em curso é o último ainda sem aprovação. O currículo só lista o que
 *  o aluno já cursou, então o último da lista é o atual — e o filtro por
 *  aprovação evita mostrar o anterior nos dias entre a nota sair e o módulo novo
 *  aparecer. */
function currentModule(record: StudentRecord | null): number | null {
  const modules = record?.programs?.flatMap((p) => p.modules ?? []) ?? [];
  if (modules.length === 0) return null;
  const pending = modules.filter((m) => !isApproved(m.status));
  const chosen = pending.at(-1) ?? modules.at(-1)!;
  return moduleNumber(chosen);
}

/** Módulo de UMA turma, do projeto dela ("GRAD CC09 - 2026-1B" → 9).
 *
 *  O currículo só sabe dizer o módulo CORRENTE — abrir uma turma passada com
 *  aquele número mostraria "Mód. 11" em cima das notas do 9. Cada turma carrega
 *  o próprio projeto, então é dele que sai o número quando não é a turma atual. */
function moduleFromProject(project: string | null): number | null {
  const raw = /CC\s*0*(\d{1,2})/i.exec(project ?? "")?.[1];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function SectionRowButton({
  section,
  active,
  busy,
  disabled,
  onSelect,
}: {
  section: SectionRow;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const closed = (section.status ?? "").toLowerCase() === "closed";
  const color = closed ? "var(--color-red)" : "var(--color-green)";
  const modulo = moduleFromProject(section.projectCaption ?? null);
  const detail = [section.projectCaption, formatDate(section.date ?? null)]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled || active}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150",
        active ? "bg-accent/5" : "hover:bg-surface-hover",
        disabled && !busy && "opacity-40",
        busy && "cursor-wait",
      )}
    >
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-control"
        style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}
      >
        {closed ? (
          <Lock size={12} style={{ color }} />
        ) : (
          <LockOpen size={12} style={{ color }} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-fg">{section.caption ?? "Turma"}</span>
          {modulo !== null && (
            <span className="shrink-0 font-mono text-[0.6rem] text-fg-muted">Mód. {modulo}</span>
          )}
        </span>
        {detail && (
          <span className="mt-0.5 block truncate text-[0.65rem] text-fg-muted">{detail}</span>
        )}
      </span>

      {busy ? (
        <Loader2 size={13} aria-hidden className="shrink-0 animate-spin text-fg-muted" />
      ) : active ? (
        <Check size={13} aria-hidden className="shrink-0 text-accent" />
      ) : null}
    </button>
  );
}

/** "Mód. 11" com a régua de semanas — e o botão que abre a lista de turmas.
 *
 *  As turmas passadas do Adalove só existiam atrás do modal "Turmas" deles; aqui
 *  o indicador do topo, que já é onde se lê em que módulo a pessoa está, é o
 *  mesmo lugar onde se troca de módulo. Turma e ano, que antes saíam de um
 *  chevron, agora moram na própria lista: são o assunto dela. */
export function ModuleProgress({
  view,
  onSelectSection,
  switchingTo,
}: {
  view: SectionView;
  /** Ausente enquanto não houver como carregar outra turma (harness sem rede). */
  onSelectSection?: (uuid: string) => void;
  /** Turma cujo /userdata está sendo baixado agora. */
  switchingTo?: string | null;
}) {
  const { data: record } = useApi<StudentRecord>("/student-curriculums/student-record");
  const { data: sectionsData, loading: sectionsLoading } = useApi<SectionRow[]>(
    onSelectSection ? "/sections" : null,
  );
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Mais recente primeiro, como no modal do Adalove: a turma atual encabeça a
  // lista e as passadas descem em ordem de quando aconteceram.
  const sections = useMemo(() => {
    const rows = Array.isArray(sectionsData) ? sectionsData : [];
    return [...rows].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [sectionsData]);

  // `composedPath` é o que enxerga através do shadow root — `event.target`
  // sozinho seria sempre o host da overlay.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !e.composedPath().includes(wrapRef.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeRow = sections.find((s) => s.uuid === view.section.uuid) ?? null;
  // Sem a lista carregada, o padrão é "é a turma atual": é o caso comum e o que
  // a tela mostrava antes de existir seletor.
  const isCurrentTurma = (activeRow?.status ?? "open").toLowerCase() !== "closed";

  const fromProject = moduleFromProject(view.section.project);
  const modulo = isCurrentTurma ? (currentModule(record) ?? fromProject) : fromProject;
  const progress = currentWeek(view, new Date());
  const busy = !!switchingTo;

  const indicator = (
    <>
      {modulo !== null && <span className="font-mono text-xs text-fg-muted">Mód. {modulo}</span>}

      {/* Turma passada não pode passar por atual: o cadeado e o nome dela ficam
          visíveis o tempo todo enquanto ela estiver aberta. */}
      {!isCurrentTurma && (
        <span className="flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 font-mono text-[0.6rem] text-fg-muted">
          <Lock size={9} aria-hidden style={{ color: "var(--color-red)" }} />
          {view.section.caption}
        </span>
      )}

      {progress && (
        <Tooltip label={`Semana ${progress.week} de ${progress.total}`} disabled={open}>
          <span className="flex items-center gap-1.5">
            <span className="block h-1 w-20 overflow-hidden rounded-full bg-line">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${(progress.week / progress.total) * 100}%` }}
              />
            </span>
            <span className="font-mono text-[0.6rem] text-fg-muted tabular">
              {progress.week}/{progress.total}
            </span>
          </span>
        </Tooltip>
      )}

      {onSelectSection &&
        (busy ? (
          <Loader2 size={12} aria-hidden className="animate-spin text-fg-muted" />
        ) : (
          <ChevronDown
            size={12}
            aria-hidden
            className={cn("text-fg-muted transition-transform duration-200", open && "rotate-180")}
          />
        ))}
    </>
  );

  // Sem como carregar outra turma (harness sem rede), o indicador volta a ser só
  // texto: um botão desabilitado engoliria também o tooltip da régua de semanas,
  // que continua útil.
  if (!onSelectSection) {
    if (modulo === null && !progress) return null;
    return <span className="flex items-center gap-2 px-2 py-1">{indicator}</span>;
  }

  return (
    <div ref={wrapRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Turma ${view.section.caption}${
          modulo === null ? "" : `, módulo ${modulo}`
        }. Trocar de turma`}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-control px-2 py-1 transition-colors duration-150 hover:bg-surface-hover",
          open && "bg-surface-hover",
        )}
      >
        {indicator}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-3rem))] overflow-hidden rounded-card border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.06em] text-fg-muted">
              Turmas {sections.length > 0 && `· ${sections.length}`}
            </span>
            <span className="text-[0.6rem] text-fg-muted">Notas, faltas e cards de cada módulo</span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {sectionsLoading && (
              <div className="space-y-2 p-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            )}

            {!sectionsLoading && sections.length === 0 && (
              <p className="p-6 text-center text-xs text-fg-muted">
                Não consegui listar suas turmas.
              </p>
            )}

            <ul className="divide-y divide-line-soft">
              {sections.map((s) => (
                <li key={s.uuid}>
                  <SectionRowButton
                    section={s}
                    active={s.uuid === view.section.uuid}
                    busy={switchingTo === s.uuid}
                    // Uma troca por vez: duas respostas de /userdata chegando
                    // fora de ordem deixariam a tela na turma errada.
                    disabled={busy}
                    onSelect={() => {
                      setOpen(false);
                      onSelectSection(s.uuid);
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
