import { ChevronDown, Settings2, X } from "lucide-react";
import { useState } from "react";
import { fmtNota } from "@/lib/format";
import type {
  MetricasModulo,
  ParticipacaoLetra,
  ParticipacaoMultipliers,
  SimulacaoConfig,
} from "@/types/grades";
import { cn } from "~/lib/cn";
import { Card } from "~/ui/Card";

// Porte do SimulationPanel do GradesInteli para um card fino que expande.
// O cálculo continua vindo de `calcularMetricas` (@/lib/grade-calculator) — aqui
// só há controles e apresentação.

const LETRAS: ParticipacaoLetra[] = ["A", "B", "C", "D", "E"];

/** Input numérico tolerante: aceita vírgula e campo vazio enquanto se digita. */
function NumberField({
  value,
  onChange,
  label,
  color,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  color?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className={cn("inline-flex items-center gap-1.5", className)}>
      {label && (
        <span className="text-[0.62rem] font-medium" style={{ color }}>
          {label}
        </span>
      )}
      <input
        inputMode="decimal"
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = Number(e.target.value.replace(",", "."));
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        onBlur={() => setDraft(null)}
        className="h-7 w-14 rounded-control border border-line bg-bg px-2 text-center font-mono text-xs text-fg outline-none transition-colors focus:border-accent tabular"
      />
    </label>
  );
}

function statusOf(m: MetricasModulo): { label: string; color: string } {
  if (m.provaFeita) return { label: "Prova já realizada", color: "var(--color-green)" };
  switch (m.provaStatus) {
    case "folga":
      return { label: "Teoricamente, pode negativar", color: "var(--color-blue)" };
    case "aprovado":
      return { label: "Cenário confortável", color: "var(--color-green)" };
    case "exigente":
      return { label: "Nota alta necessária", color: "var(--color-yellow)" };
    default:
      return { label: "Acima de 10, improvável", color: "var(--color-red)" };
  }
}

export function Simulador({
  metrics,
  simulacao,
  onSimulacao,
  participacao,
  onParticipacao,
  multipliers,
  onMultipliers,
}: {
  metrics: MetricasModulo;
  simulacao: SimulacaoConfig;
  onSimulacao: (s: SimulacaoConfig) => void;
  participacao: ParticipacaoLetra;
  onParticipacao: (p: ParticipacaoLetra) => void;
  multipliers: ParticipacaoMultipliers;
  onMultipliers: (m: ParticipacaoMultipliers) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showMult, setShowMult] = useState(false);

  const status = statusOf(metrics);
  // Fora da faixa 0–10 mostramos o valor cru: dizer "10,00" quando são precisos
  // 13 esconderia justamente a informação que importa.
  const needed = metrics.provaFeita
    ? "Feita"
    : metrics.provaStatus === "impossivel" || metrics.provaStatus === "folga"
      ? fmtNota(metrics.notaNecessariaProvaRaw)
      : fmtNota(metrics.notaNecessariaProva);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-hover"
      >
        <span className="text-sm font-medium text-fg">Quanto preciso na prova?</span>

        <span className="ml-auto flex items-center gap-3">
          <span className="hidden text-[0.68rem] sm:inline" style={{ color: status.color }}>
            {status.label}
          </span>
          <span
            className="font-mono text-xl font-medium tracking-tight tabular"
            style={{ color: status.color }}
          >
            {needed}
          </span>
          <ChevronDown
            size={15}
            aria-hidden
            className={cn(
              "shrink-0 text-fg-muted transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {/* grid-template-rows 0fr→1fr: expande na altura real do conteúdo, sem
          precisar medir nada nem chutar um max-height. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.4,0,.2,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid gap-5 border-t border-line px-4 py-4 lg:grid-cols-[1fr_auto_16rem]">
            <div className="space-y-4">
              <div>
                <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                  Nota para atividades restantes
                </div>
                <div className="mt-2 inline-flex overflow-hidden rounded-control border border-line">
                  {[
                    { label: "Fixa", value: false },
                    { label: "Até o momento", value: true },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() =>
                        onSimulacao({ ...simulacao, manterAteOMomento: option.value })
                      }
                      className={cn(
                        "px-2.5 py-1 text-[0.68rem] transition-colors duration-150",
                        simulacao.manterAteOMomento === option.value
                          ? "bg-accent text-white"
                          : "bg-bg text-fg-soft hover:text-fg",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {!simulacao.manterAteOMomento && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <NumberField
                      label="Ponderada"
                      color="var(--color-ponderada)"
                      value={simulacao.notaAssumidaPonderada}
                      onChange={(v) => onSimulacao({ ...simulacao, notaAssumidaPonderada: v })}
                    />
                    <NumberField
                      label="Artefato"
                      color="var(--color-artefato)"
                      value={simulacao.notaAssumidaArtefato}
                      onChange={(v) => onSimulacao({ ...simulacao, notaAssumidaArtefato: v })}
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                    Participação
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMult((v) => !v)}
                    title="Editar multiplicadores"
                    className="text-fg-muted transition-colors hover:text-fg"
                  >
                    {showMult ? <X size={11} aria-hidden /> : <Settings2 size={11} aria-hidden />}
                  </button>
                </div>

                <div className="mt-2 inline-flex overflow-hidden rounded-control border border-line">
                  {LETRAS.map((letra) => (
                    <button
                      key={letra}
                      type="button"
                      aria-label={`Participação ${letra}`}
                      aria-pressed={participacao === letra}
                      onClick={() => onParticipacao(letra)}
                      className={cn(
                        "w-9 py-1 font-mono text-xs transition-colors duration-150 tabular",
                        participacao === letra
                          ? "bg-accent text-white"
                          : "bg-bg text-fg-soft hover:text-fg",
                      )}
                    >
                      {letra}
                    </button>
                  ))}
                </div>

                {showMult && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {LETRAS.map((letra) => (
                      <NumberField
                        key={letra}
                        label={letra}
                        value={multipliers[letra]}
                        onChange={(v) => onMultipliers({ ...multipliers, [letra]: v })}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden w-px bg-line lg:block" />

            <div className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                    Objetivo final
                  </span>
                  <span className="font-mono text-sm text-fg tabular">
                    {simulacao.metaFinal.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={simulacao.metaFinal}
                  aria-label="Objetivo final"
                  onChange={(e) =>
                    onSimulacao({ ...simulacao, metaFinal: parseFloat(e.target.value) })
                  }
                  className="gi-range mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                    Projeção
                  </div>
                  <div className="mt-1 font-mono text-base text-fg tabular">
                    {fmtNota(metrics.acumuladoFinalProjetado)}
                  </div>
                </div>
                <div>
                  <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
                    Não avaliado
                  </div>
                  <div className="mt-1 font-mono text-base text-fg tabular">
                    {Math.round(metrics.pontosNaoAvaliados * 100)}
                    <span className="text-xs text-fg-muted"> pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
