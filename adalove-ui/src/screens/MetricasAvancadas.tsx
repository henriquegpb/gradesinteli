import { ArrowLeft, ExternalLink, RotateCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FICHA_URL,
  FichaError,
  type Faixa,
  type Ficha,
  type FichaProjeto,
} from "~/data/ficha";
import { cn } from "~/lib/cn";
import { formatNaiveDate } from "~/lib/date";
import { gradeColor } from "~/lib/grade";
import { Badge } from "~/ui/Badge";
import { Button } from "~/ui/Button";
import { Card, CardTitle } from "~/ui/Card";
import { Skeleton } from "~/ui/Skeleton";
import { Tabs } from "~/ui/Tabs";

// Métricas do módulo corrente comparadas à turma, vindas da "Ficha do aluno"
// (Apps Script da Inteli — ver `~/data/ficha`). A ordem da tela segue a da
// ficha original: onde você está, o que está em risco agora, e só então o
// detalhe por componente, que é o que se consulta com calma.

const num = (n: number | null | undefined, digits = 2) =>
  n == null
    ? "n/d"
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

const pct = (n: number | null | undefined, digits = 0) =>
  n == null ? "n/d" : `${num(n, digits)}%`;

/** "+0,12" / "−0,05": o sinal é a informação, então vai sempre. */
const signed = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : "±"}${num(Math.abs(n))}`;

function quartilLabel(percentil: number): string {
  if (percentil >= 75) return "Top quartil";
  if (percentil >= 50) return "2º quartil";
  if (percentil >= 25) return "3º quartil";
  return "4º quartil";
}

// ---- peças -----------------------------------------------------------------

function Legend({ items }: { items: { label: string; swatch: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-fg-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.swatch}
          {i.label}
        </span>
      ))}
    </div>
  );
}

const Dot = ({ color }: { color: string }) => (
  <span
    className="inline-block size-2 rounded-full"
    style={{ background: color }}
  />
);
const Tick = ({ color }: { color: string }) => (
  <span
    className="inline-block h-3 w-0.5 rounded-full"
    style={{ background: color }}
  />
);

/** Régua 0–10 com a sua marca e a de referência. Usada nos componentes: o que
 *  importa ali é a distância entre as duas, não o valor de cada uma. */
function Rule({
  you,
  mark,
  min,
  max,
  refColor = "var(--color-green)",
}: {
  you: number | null;
  mark?: number | null;
  min?: number | null;
  max?: number | null;
  refColor?: string;
}) {
  const x = (v: number) => `${Math.max(0, Math.min(100, v * 10))}%`;
  return (
    <div className="relative h-2 rounded-full bg-line-soft">
      {min != null && max != null && (
        <div
          className="absolute inset-y-0 rounded-full bg-line"
          style={{ left: x(min), width: `calc(${x(max)} - ${x(min)})` }}
        />
      )}
      {you != null && (
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: x(you) }}
        />
      )}
      {mark != null && (
        <div
          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full ring-2 ring-surface"
          style={{ left: x(mark), background: refColor }}
        />
      )}
    </div>
  );
}

// ---- topo ------------------------------------------------------------------

// ---- trajetória ------------------------------------------------------------

const SERIES = [
  {
    key: "you",
    label: "Você",
    color: "var(--color-accent)",
    dash: undefined,
    width: 2,
  },
  {
    key: "top25",
    label: "Top quartil",
    color: "var(--color-green)",
    dash: "5 4",
    width: 1.5,
  },
  {
    key: "media",
    label: "Média da turma",
    color: "var(--color-fg-muted)",
    dash: "2 3",
    width: 1.5,
  },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

function Trajetoria({ ficha }: { ficha: Ficha }) {
  const points = useMemo(
    () =>
      Object.keys(ficha.aluno.serie)
        .map(Number)
        .sort((a, b) => a - b)
        .map((week) => ({
          week,
          you: ficha.aluno.serie[week],
          top25: ficha.turma.serie[week]?.top25 ?? null,
          media: ficha.turma.serie[week]?.media ?? null,
        })),
    [ficha],
  );
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 560, h: 160 });

  // Desenhado no tamanho real da caixa, não num viewBox esticado: a altura vem
  // do card ao lado (a linha da grade estica os dois), e escalar um viewBox fixo
  // para caber nela deformaria o texto dos eixos.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setSize({ w: box.clientWidth, h: box.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Eixo até a semana 10 mesmo quando a série para antes: o módulo tem dez
  // semanas, e ver o espaço que falta é parte da leitura.
  const W = Math.max(size.w, 200);
  const H = Math.max(size.h, 120);
  const pad = { l: 32, r: 44, t: 12, b: 24 };
  const lastWeek = Math.max(10, ...points.map((p) => p.week));
  // Escala até um ponto acima do maior valor, não até 10: a nota garantida só
  // chega perto de 10 no fim do módulo, e com o eixo inteiro as três linhas
  // viravam uma só — justo a diferença entre elas é o que a tela mostra.
  const peak = Math.max(
    ...points.map((p) => Math.max(p.you ?? 0, p.top25 ?? 0, p.media ?? 0)),
  );
  const yMax = Math.min(10, Math.ceil(peak) + 1);
  const yStep = yMax > 6 ? 2 : 1;
  const x = (w: number) =>
    pad.l + ((w - 1) / (lastWeek - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);

  const path = (key: SeriesKey) =>
    points
      .filter((p) => p[key] != null)
      .map((p, i) => `${i ? "L" : "M"}${x(p.week)},${y(p[key] as number)}`)
      .join(" ");

  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points)
      if (Math.abs(x(p.week) - vx) < Math.abs(x(best.week) - vx)) best = p;
    setHover(best.week);
  };

  const hovered = points.find((p) => p.week === hover) ?? null;
  const last = points[points.length - 1];

  // Rótulos da ponta, empurrados para não se sobreporem quando as linhas
  // terminam coladas (é o caso típico: você e o top quartil a 0,05 um do outro).
  const endLabels = last
    ? SERIES.filter((s) => last[s.key] != null)
        .map((s) => ({
          ...s,
          v: last[s.key] as number,
          py: y(last[s.key] as number),
        }))
        .sort((a, b) => a.py - b.py)
        .reduce<{ key: string; v: number; py: number }[]>((acc, l) => {
          const prev = acc[acc.length - 1];
          acc.push({
            ...l,
            py: prev && l.py - prev.py < 11 ? prev.py + 11 : l.py,
          });
          return acc;
        }, [])
    : [];

  return (
    <Card className="flex h-full flex-col p-4">
      <CardTitle>Nota garantida por semana</CardTitle>
      <p className="mt-1 text-xs text-fg-soft">
        O que já está fechado a cada semana, mesmo zerando o resto. Sobe
        conforme as entregas são avaliadas.
      </p>

      <div ref={boxRef} className="relative mt-3 min-h-[150px] flex-1">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 block touch-none select-none"
          role="img"
          aria-label="Nota garantida por semana: você, top quartil e média da turma"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {Array.from(
            { length: Math.floor(yMax / yStep) + 1 },
            (_, i) => i * yStep,
          ).map((v) => (
            <g key={v}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--color-line-soft)"
              />
              <text
                x={pad.l - 8}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                fontSize={10}
                fill="var(--color-fg-muted)"
              >
                {v}
              </text>
            </g>
          ))}
          {Array.from({ length: lastWeek }, (_, i) => i + 1).map((w) => (
            <text
              key={w}
              x={x(w)}
              y={H - 6}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-fg-muted)"
            >
              {w}
            </text>
          ))}

          {hovered && (
            <line
              x1={x(hovered.week)}
              x2={x(hovered.week)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="var(--color-line)"
            />
          )}

          {[...SERIES].reverse().map((s) => (
            <path
              key={s.key}
              d={path(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {hovered &&
            SERIES.map(
              (s) =>
                hovered[s.key] != null && (
                  <circle
                    key={s.key}
                    cx={x(hovered.week)}
                    cy={y(hovered[s.key] as number)}
                    r={4}
                    fill={s.color}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ),
            )}

          {!hovered &&
            last &&
            endLabels.map((l) => (
              <text
                key={l.key}
                x={x(last.week) + 6}
                y={l.py}
                dy="0.32em"
                fontSize={10}
                fill="var(--color-fg-soft)"
                className="tabular"
              >
                {num(l.v)}
              </text>
            ))}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(x(hovered.week) / W) * 100}%`,
              transform:
                hovered.week > lastWeek / 2
                  ? "translateX(calc(-100% - 12px))"
                  : "translateX(12px)",
            }}
          >
            <div className="mb-1 text-fg-muted">Semana {hovered.week}</div>
            {SERIES.map((s) => (
              <div
                key={s.key}
                className="flex items-center justify-between gap-3"
              >
                <span className="inline-flex items-center gap-1.5 text-fg-soft">
                  <Dot color={s.color} />
                  {s.label}
                </span>
                <span className="font-mono text-fg tabular">
                  {num(hovered[s.key])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2">
        <Legend
          items={SERIES.map((s) => ({
            label: s.label,
            swatch: (
              <svg width="16" height="4" aria-hidden>
                <line
                  x1="1"
                  x2="15"
                  y1="2"
                  y2="2"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dash}
                  strokeLinecap="round"
                />
              </svg>
            ),
          }))}
        />
      </div>
    </Card>
  );
}

function Posicao({ ficha }: { ficha: Ficha }) {
  const { percentil, quartis } = ficha.aluno;
  const total = ficha.meta.total_alunos;
  // A ficha só manda o percentil ("17% da turma tem nota maior"); a contagem sai
  // dele. Com 29 alunos, 17% é 4,93 — são 5 à frente, e 5/29 = 17,2% confere.
  const ahead =
    percentil != null ? Math.round(((100 - percentil) * total) / 100) : null;
  const rows: [string, { nota: number | null; quartil: number | null }][] = [
    ["Ponderadas", quartis.autoestudo],
    ["Projeto", quartis.projeto],
    ["Prova", quartis.prova],
  ];

  return (
    <Card className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>Posição na turma</CardTitle>
          {percentil != null && (
            <Badge tone={percentil >= 75 ? "positive" : "default"}>
              {quartilLabel(percentil)}
            </Badge>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-xs text-fg-muted">percentil</span>
          <span className="font-mono text-2xl font-medium text-fg tabular">
            {percentil ?? "n/d"}
          </span>
        </div>
        {ahead != null && (
          <p className="mt-1 text-xs text-fg-soft">
            {ahead === 0 ? (
              <>Ninguém à sua frente. Você é o 1º de {total}.</>
            ) : (
              <>
                <span className="font-mono text-fg tabular">{ahead}</span> de{" "}
                {total} à sua frente. Você é o {ahead + 1}º.
              </>
            )}
          </p>
        )}
      </div>
      <ul className="space-y-1.5 border-line-soft text-xs max-sm:border-t max-sm:pt-3 sm:self-center sm:border-l sm:pl-4">
        {rows.map(([label, q]) => (
          <li key={label} className="flex items-center justify-between gap-2">
            <span className="text-fg-soft">{label}</span>
            <span className="font-mono tabular text-fg-muted">
              {q.nota == null ? (
                "sem nota"
              ) : (
                <>
                  <span style={{ color: gradeColor(q.nota) }}>
                    {num(q.nota)}
                  </span>
                  {q.quartil != null && <span> · Q{q.quartil}</span>}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A sua presença já está no card de Faltas da Vida Acadêmica; o que só a ficha
 *  sabe é a da turma. Por isso a turma é o número grande e a sua vai de canto. */
function Frequencia({ ficha }: { ficha: Ficha }) {
  const turma = ficha.turma.engajamento.presenca;
  const you = ficha.aluno.engajamento.presenca_pct;

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <CardTitle>Frequência média da turma</CardTitle>
        {you != null && (
          <span className="text-xs text-fg-muted">
            você{" "}
            <span className="font-mono text-fg-soft tabular">{pct(you)}</span>
          </span>
        )}
      </div>
      <div className="mt-2 font-mono text-2xl font-medium text-fg tabular">
        {pct(turma, 1)}
      </div>
      <p className="mt-1 text-xs text-fg-soft">
        Presença média dos {ficha.meta.total_alunos} alunos no módulo até agora.
      </p>
    </Card>
  );
}

function Foco({ ficha }: { ficha: Ficha }) {
  const you = ficha.aluno.faixa;
  const top = ficha.turma.faixa_top25;
  const rows: [string, string, number, number][] = [
    ["Otimista", "tirando 10 no que falta", you.n_max, top.n_max],
    ["Atual", "média do que já foi avaliado", you.n_atual, top.n_atual],
    ["Pessimista", "zerando o que falta", you.n_min, top.n_min],
  ];

  return (
    <Card className="p-4">
      <CardTitle>Distância do top quartil</CardTitle>
      <p className="mt-1 text-xs text-fg-soft">
        As três projeções da sua nota contra o patamar de quem está no top 25%
        da turma.
      </p>
      <ul className="mt-4 space-y-4">
        {rows.map(([label, hint, v, ref]) => {
          const delta = v - ref;
          return (
            <li key={label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                <span>
                  <span className="text-fg">{label}</span>{" "}
                  <span className="text-fg-muted">· {hint}</span>
                </span>
                <span className="shrink-0 font-mono tabular">
                  <span className="text-fg">{num(v)}</span>
                  <span className="text-fg-muted"> vs {num(ref)} </span>
                  <span className={delta >= 0 ? "text-green" : "text-red"}>
                    {signed(delta)}
                  </span>
                </span>
              </div>
              <Rule you={v} mark={ref} />
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <Legend
          items={[
            { label: "Você", swatch: <Dot color="var(--color-accent)" /> },
            {
              label: "Top quartil",
              swatch: <Tick color="var(--color-green)" />,
            },
          ]}
        />
      </div>
    </Card>
  );
}

// ---- componentes -----------------------------------------------------------

function ProjetoRow({ p }: { p: FichaProjeto }) {
  return (
    <li className="grid gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_14rem_5rem]">
      <div className="min-w-0">
        <div className="text-sm leading-snug text-fg">{p.atividade}</div>
        <div className="mt-0.5 font-mono text-[0.7rem] text-fg-muted tabular">
          peso {p.peso} · grupo {num(p.nota_grupo)} × fator{" "}
          {num(p.fator_performance)}
        </div>
      </div>
      <div className="flex flex-col justify-center gap-1">
        <Rule
          you={p.nota_final}
          mark={p.nota_final_turma}
          min={p.nota_final_min_turma}
          max={p.nota_final_max_turma}
        />
        <div className="font-mono text-[0.65rem] text-fg-muted tabular">
          turma {num(p.nota_final_turma)} · de {num(p.nota_final_min_turma)} a{" "}
          {num(p.nota_final_max_turma)}
        </div>
      </div>
      <div
        className="text-right font-mono text-sm tabular md:self-center"
        style={{ color: gradeColor(p.nota_final) }}
      >
        {num(p.nota_final)}
      </div>
    </li>
  );
}

function Projeto({ ficha }: { ficha: Ficha }) {
  const sprints = useMemo(() => {
    const by = new Map<number, FichaProjeto[]>();
    for (const p of ficha.aluno.projeto)
      by.set(p.sprint, [...(by.get(p.sprint) ?? []), p]);
    return [...by.entries()].sort(([a], [b]) => a - b);
  }, [ficha]);

  if (sprints.length === 0)
    return <Empty>Nenhum artefato avaliado ainda.</Empty>;

  return (
    <div className="space-y-3">
      {sprints.map(([sprint, items]) => {
        const fator = items[0]?.fator_performance;
        const fatorTurma = items[0]?.fator_turma;
        return (
          <Card key={sprint} className="p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle>
                Sprint {sprint} · semana {items[0]?.semana}
              </CardTitle>
              <span className="font-mono text-xs text-fg-muted tabular">
                fator de performance{" "}
                <span className="text-fg">{num(fator)}</span> · turma{" "}
                {num(fatorTurma)}
              </span>
            </div>
            <ul className="divide-y divide-line-soft">
              {items.map((p) => (
                <ProjetoRow key={p.atividade} p={p} />
              ))}
            </ul>
          </Card>
        );
      })}
      <Legend
        items={[
          {
            label: "Sua nota final",
            swatch: <Dot color="var(--color-accent)" />,
          },
          {
            label: "Média da turma",
            swatch: <Tick color="var(--color-green)" />,
          },
          {
            label: "Menor e maior da turma",
            swatch: <Dot color="var(--color-line)" />,
          },
        ]}
      />
    </div>
  );
}

function Autoestudo({ ficha }: { ficha: Ficha }) {
  const eixos = ficha.aluno.autoestudo;
  if (eixos.length === 0)
    return <Empty>Nenhuma ponderada avaliada ainda.</Empty>;
  const q = ficha.aluno.quartis.autoestudo;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Ponderadas por eixo</CardTitle>
        {q.nota != null && (
          <span className="font-mono text-xs text-fg-muted tabular">
            média <span className="text-fg">{num(q.nota)}</span>
            {q.quartil != null && <> · Q{q.quartil}</>}
          </span>
        )}
      </div>
      <ul className="mt-4 space-y-4">
        {eixos.map((e) => {
          const delta =
            e.media != null && e.media_turma != null
              ? e.media - e.media_turma
              : null;
          return (
            <li key={e.eixo}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                <span>
                  <span className="text-fg">{e.eixo_nome}</span>{" "}
                  <span className="text-fg-muted">
                    · {e.qtd_atividades}{" "}
                    {e.qtd_atividades === 1 ? "atividade" : "atividades"}
                  </span>
                </span>
                <span className="shrink-0 font-mono tabular">
                  <span className="text-fg">{num(e.media)}</span>
                  <span className="text-fg-muted">
                    {" "}
                    vs {num(e.media_turma)}{" "}
                  </span>
                  {delta != null && (
                    <span className={delta >= 0 ? "text-green" : "text-red"}>
                      {signed(delta)}
                    </span>
                  )}
                </span>
              </div>
              <Rule you={e.media} mark={e.media_turma} />
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <Legend
          items={[
            { label: "Você", swatch: <Dot color="var(--color-accent)" /> },
            {
              label: "Média da turma",
              swatch: <Tick color="var(--color-green)" />,
            },
          ]}
        />
      </div>
    </Card>
  );
}

const FAIXAS: Faixa[] = ["A", "B", "C", "D", "E"];

function Participacao({ ficha }: { ficha: Ficha }) {
  const { participacao: p, faixa_participacao: oficial } = ficha.aluno;
  const faixa = oficial.faixa ?? p.faixa_provavel;
  const dist = ficha.turma.participacao_distribuicao;
  const scale = Math.max(...dist.flatMap((d) => [d.pct_turma, d.pct_norma]), 1);
  const intervalo =
    p.faixa_provavel_melhor &&
    p.faixa_provavel_pior &&
    p.faixa_provavel_melhor !== p.faixa_provavel_pior
      ? `entre ${p.faixa_provavel_melhor} e ${p.faixa_provavel_pior}`
      : null;
  const margem = p.margem_pp != null ? num(p.margem_pp, 1) : null;

  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>Faixa de participação</CardTitle>
          <Badge tone={oficial.faixa ? "positive" : "default"}>
            {oficial.faixa ? "Oficial" : "Estimativa"}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-fg">
          {oficial.faixa
            ? "Sua faixa oficial é "
            : "Se o módulo fechasse hoje, você estaria na faixa "}
          <span className="font-mono font-medium">{faixa ?? "n/d"}</span>.
        </p>
        <div className="mt-4 grid max-w-sm grid-cols-5 gap-1.5">
          {FAIXAS.map((f) => (
            <div
              key={f}
              className={cn(
                "grid h-10 place-items-center rounded-md border font-mono text-sm",
                f === faixa
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-dashed border-line text-fg-muted",
              )}
            >
              {f}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex max-w-sm justify-between text-[0.7rem] text-fg-muted">
          <span>A · mais destaques</span>
          <span>E · menos destaques</span>
        </div>
        <ul className="mt-4 space-y-1 border-t border-line-soft pt-3 text-xs text-fg-soft">
          <li>
            A faixa vem dos destaques que o professor registra nos encontros de
            instrução.
          </li>
          {/* `margem_pp` é a margem de erro da estimativa, não a distância até a
              faixa vizinha: a ficha só a usa para derivar a melhor e a pior faixa
              (é o que os demos dela mostram). A distância em si ela não manda. */}
          {!oficial.faixa && intervalo && (
            <li>
              {margem && <>Com a margem de ±{margem} pp da estimativa, você </>}
              {margem ? "pode" : "Pode"} terminar {intervalo}.
            </li>
          )}
          {!oficial.faixa && !intervalo && margem && faixa && (
            <li>
              A estimativa tem margem de ±{margem} pp, e mesmo no melhor caso você fica no{" "}
              {faixa}.
            </li>
          )}
          {!p.ciclo_fechado && p.fechamento_previsto && (
            <li className="text-fg-muted">
              A faixa oficial sai quando a coordenação fechar o módulo, previsto
              para {formatNaiveDate(p.fechamento_previsto)}.
            </li>
          )}
        </ul>
      </Card>

      <Card className="p-4">
        <CardTitle>Sua turma hoje vs. cota</CardTitle>
        <p className="mt-1 text-xs text-fg-soft">
          A cota de cada faixa é a mesma para toda turma.
        </p>
        <ul className="mt-4 space-y-2">
          {dist.map((d) => (
            <li
              key={d.faixa}
              className={cn(
                "grid grid-cols-[1.5rem_1fr] items-center gap-3 rounded-md px-2 py-1.5",
                d.faixa === faixa && "bg-line-soft",
              )}
            >
              <span className="font-mono text-sm text-fg">{d.faixa}</span>
              <div className="space-y-1">
                {[
                  {
                    label: "turma",
                    value: d.pct_turma,
                    hint: `${d.alunos_turma} alunos`,
                    color: "var(--color-accent)",
                  },
                  {
                    label: "cota",
                    value: d.pct_norma,
                    hint: `Inteli ${pct(d.pct_inteli, 1)}`,
                    color: "var(--color-fg-muted)",
                  },
                ].map((bar) => (
                  <div
                    key={bar.label}
                    className="grid grid-cols-[2.5rem_1fr_3rem] items-center gap-2 text-[0.7rem]"
                    title={bar.hint}
                  >
                    <span className="text-fg-muted">{bar.label}</span>
                    <div className="h-1.5 rounded-full bg-line-soft">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(bar.value / scale) * 100}%`,
                          background: bar.color,
                        }}
                      />
                    </div>
                    <span className="text-right font-mono text-fg-soft tabular">
                      {pct(bar.value, 1)}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Card className="p-6">
      <p className="text-sm text-fg-muted">{children}</p>
    </Card>
  );
}

// ---- tela ------------------------------------------------------------------

type Tab = "projeto" | "autoestudo" | "participacao" | "trajetoria";

const TABS: { label: string; value: Tab }[] = [
  { label: "Participação", value: "participacao" },
  { label: "Projeto", value: "projeto" },
  { label: "Ponderadas", value: "autoestudo" },
  { label: "Trajetória", value: "trajetoria" },
];

const ERRORS: Record<FichaError["reason"], string> = {
  permission: "",
  login:
    "Entre na sua conta Google do Inteli (@sou.inteli.edu.br) neste navegador para ver suas métricas.",
  network:
    "Não consegui falar com a ficha agora. Verifique a conexão e tente de novo.",
  http: "A ficha respondeu com erro. Tente de novo em alguns minutos.",
  format:
    "A ficha mudou de formato e não consegui ler os dados. Abra a ficha original enquanto isso.",
  unavailable: "As métricas avançadas só funcionam dentro da extensão.",
};

/** Primeira visita: a permissão de script.google.com é opcional e só é pedida
 *  aqui, no clique — então este card é o único lugar em que o aluno descobre
 *  que ela existe e para que serve. */
function Autorizar({ onAuthorize }: { onAuthorize?: () => Promise<void> }) {
  const [waiting, setWaiting] = useState(false);

  return (
    <Card className="p-6">
      <CardTitle>Falta um passo</CardTitle>
      <h2 className="mt-2 text-base font-medium text-fg">Autorize o acesso à Ficha do aluno</h2>
      <p className="mt-2 max-w-2xl text-sm text-fg-soft">
        Estas métricas vêm da Ficha do aluno da Inteli, que fica no Google (
        <span className="font-mono text-xs">script.google.com</span>). A extensão busca a ficha com o seu
        login Google do Inteli e mostra aqui. Os dados não saem do seu navegador.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!onAuthorize}
          onClick={() => {
            if (!onAuthorize) return;
            setWaiting(true);
            // Não há "recusou" para ouvir: se a janela fechar sem aceitar, o botão
            // volta a funcionar no próximo clique, que a reabre.
            void onAuthorize().finally(() => setWaiting(false));
            setTimeout(() => setWaiting(false), 4000);
          }}
        >
          Autorizar acesso
        </Button>
        <span className="text-xs text-fg-muted">
          {waiting
            ? "Clique em Permitir na janela que abriu."
            : "Abre uma janela da extensão e o navegador confirma a permissão."}
        </span>
      </div>
    </Card>
  );
}

export function MetricasAvancadas({
  fetchFicha,
  authorizeFicha,
  onBack,
}: {
  fetchFicha?: () => Promise<Ficha>;
  authorizeFicha?: () => Promise<void>;
  onBack?: () => void;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState<FichaError["reason"] | null>(
    fetchFicha ? null : "unavailable",
  );
  const [loading, setLoading] = useState(!!fetchFicha);
  const [tab, setTab] = useState<Tab>("participacao");

  const load = useCallback(() => {
    if (!fetchFicha) return () => {};
    let alive = true;
    setLoading(true);
    setError(null);
    fetchFicha()
      .then((data) => alive && setFicha(data))
      .catch(
        (e: unknown) =>
          alive && setError(e instanceof FichaError ? e.reason : "network"),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchFicha]);

  useEffect(load, [load]);

  const dataDe = formatNaiveDate(
    ficha?.aluno.engajamento.presenca_origem?.data ?? null,
  );

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={13} aria-hidden />
          Acadêmico
        </button>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-xl font-medium text-fg">Métricas avançadas</h1>
            {ficha && (
              <span className="font-mono text-xs text-fg-muted tabular">
                {ficha.meta.turma}
                {ficha.aluno.grupo && ` · ${ficha.aluno.grupo}`} · semana{" "}
                {ficha.meta.semana_corte} de 10
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            Sua performance no módulo comparada à turma.
            {dataDe && (
              <> Dados de {dataDe}. A ficha atualiza todo dia de manhã.</>
            )}
          </p>
        </div>
        <a
          href={FICHA_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          Ficha original
          <ExternalLink size={12} aria-hidden />
        </a>
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
          <Skeleton className="h-72" />
        </div>
      )}

      {error === "permission" && !loading && (
        <Autorizar onAuthorize={authorizeFicha &&
            (() =>
              authorizeFicha().then(() => {
                load();
              }))} />
      )}

      {error && error !== "permission" && !loading && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-6">
          <p className="text-sm text-fg-soft">{ERRORS[error]}</p>
          <div className="flex gap-2">
            {error === "login" && (
              <a
                href={FICHA_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-transparent bg-accent px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Entrar com Google
                <ExternalLink size={13} aria-hidden />
              </a>
            )}
            {fetchFicha && (
              <Button onClick={load}>
                <RotateCw size={13} aria-hidden />
                Tentar de novo
              </Button>
            )}
          </div>
        </Card>
      )}

      {ficha && !loading && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Posicao ficha={ficha} />
            <Frequencia ficha={ficha} />
          </div>

          <div className="pt-2">
            <Tabs options={TABS} value={tab} onChange={setTab} />
          </div>

          {tab === "projeto" && <Projeto ficha={ficha} />}
          {tab === "autoestudo" && <Autoestudo ficha={ficha} />}
          {tab === "participacao" && <Participacao ficha={ficha} />}
          {tab === "trajetoria" && (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Trajetoria ficha={ficha} />
              <Foco ficha={ficha} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
