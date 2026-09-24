"use client";
import { useState, type CSSProperties } from "react";
import type { SimulacaoConfig, MetricasModulo, ParticipacaoLetra, ParticipacaoMultipliers, AttendanceData } from "@/types/grades";
import { fmtNota } from "@/lib/format";
import { Pencil, X, Settings } from "lucide-react";
import NumericInput from "@/components/ui/NumericInput";
import ElectricBorder from "@/components/ui/ElectricBorder";
import styles from "./SimulationPanel.module.css";

const LETRAS: ParticipacaoLetra[] = ["A", "B", "C", "D", "E"];

const BARES_CELEBRACAO: { titulo: string; sub: string; tilt: number; href?: string }[] = [
  { titulo: "Rolê no Share 🪩", sub: "Resenha com os amigos", tilt: -4, href: "https://sharesl.com.br/en/unidades/butanta" },
  { titulo: "Chopp no São Conrado 🍺", sub: "Um chopp pra desestressar", tilt: 3, href: "https://botecosaoconrado.com.br/" },
  { titulo: "Night no Vila JK 🍸", sub: "Joga tudo pra cima kkkk", tilt: 3.5, href: "https://www.vilajk.com.br/" },
  { titulo: "Tarde conhecendo a Nora AI ⭐️", sub: "", tilt: -4.5, href: "https://www.linkedin.com/in/hbarone/" },
];

interface Props {
  simulacao: SimulacaoConfig;
  onSimulacaoChange: (s: SimulacaoConfig) => void;
  metricas: MetricasModulo;
  participacao: ParticipacaoLetra;
  multipliers: ParticipacaoMultipliers;
  onParticipacaoChange: (p: ParticipacaoLetra) => void;
  onMultipliersChange: (m: ParticipacaoMultipliers) => void;
  effectiveMetaFinal: number;
  attendance: AttendanceData | null;
}

export default function SimulationPanel({
  simulacao,
  onSimulacaoChange,
  metricas,
  participacao,
  multipliers,
  onParticipacaoChange,
  onMultipliersChange,
  effectiveMetaFinal,
  attendance,
}: Props) {
  const [showSlider, setShowSlider] = useState(false);
  const [showMultConfig, setShowMultConfig] = useState(false);

  const provaLabel = metricas.provaFeita
    ? "Prova já realizada"
    : metricas.provaStatus === "folga"
      ? "Teoricamente, pode negativar"
      : metricas.provaStatus === "aprovado"
        ? "Cenário confortável"
        : metricas.provaStatus === "exigente"
          ? "Nota alta necessária"
          : "Acima de 10, improvável";

  const provaClass = metricas.provaFeita
    ? styles.success
    : metricas.provaStatus === "folga"
      ? styles.info
      : metricas.provaStatus === "aprovado"
        ? styles.success
        : metricas.provaStatus === "exigente"
          ? styles.warning
          : styles.danger;

  const mult = multipliers[participacao];
  const notaComParticipacao = metricas.acumuladoFinalProjetado * mult;

  const EPS = 1e-9;
  const moduloCompleto =
    metricas.pontosAvaliados > 0 && metricas.pontosNaoAvaliados <= EPS;
  const notaFinal = metricas.acumuladoTotal;

  // Falta reprova independente da nota — só mostramos se as faltas foram importadas.
  if (attendance && attendance.percentFaltas >= 21) {
    return (
      <div className={`${styles.wrapper} gh-card`}>
        <div className={styles.completeBody}>
          <span className={styles.completeEyebrow}>Módulo encerrado</span>
          <span className={`${styles.completeTitle} ${styles.danger}`}>
            Bombou por falta
          </span>
          <div className={styles.completeGradeRow}>
            <span className={styles.completeGradeLabel}>Faltas</span>
            <span className={`${styles.completeGrade} ${styles.danger}`}>
              {attendance.percentFaltas.toFixed(1)}%
            </span>
          </div>
          <span className={`${styles.completeMessage} ${styles.danger}`}>
            Que errada hein, esse limite de 20% não tem sentido mesmo.
          </span>
        </div>
      </div>
    );
  }

  if (moduloCompleto) {
    const estado =
      notaFinal < 4 ? "reprovado" : notaFinal < 7 ? "recuperacao" : "aprovado";

    const conteudo = {
      reprovado: {
        eyebrow: "Módulo encerrado",
        titulo: "Reprovado",
        mensagem: "Aqui acabou kkkk Próxima vez é mais fácil porque você já estudou isso",
        valueClass: styles.danger,
        statusClass: styles.danger,
      },
      recuperacao: {
        eyebrow: "Módulo encerrado",
        titulo: "Recuperação",
        mensagem: "Ainda tem salvação, você já estudou tudo, corre atrás da recuperação!",
        valueClass: styles.warning,
        statusClass: styles.warning,
      },
      aprovado: {
        eyebrow: "Módulo concluído",
        titulo: "Aprovado!",
        mensagem: "Mandou muito bem, agora da um tempo pro seu Claude e vai celebrar 🎉",
        valueClass: styles.feita,
        statusClass: styles.success,
      },
    }[estado];

    const cardInterno = (
      <div className={styles.completeBody}>
        <span className={styles.completeEyebrow}>{conteudo.eyebrow}</span>
        <span className={`${styles.completeTitle} ${conteudo.valueClass}`}>
          {conteudo.titulo}
        </span>
        <div className={styles.completeGradeRow}>
          <span className={styles.completeGradeLabel}>Nota final</span>
          <span className={`${styles.completeGrade} ${conteudo.valueClass}`}>
            {fmtNota(notaFinal)}
          </span>
        </div>
        <span className={`${styles.completeMessage} ${conteudo.statusClass}`}>
          {conteudo.mensagem}
        </span>
      </div>
    );

    if (estado === "aprovado") {
      const renderBar = (bar: (typeof BARES_CELEBRACAO)[number]) => {
        const style = { "--tilt": `${bar.tilt}deg` } as CSSProperties;
        const inner = (
          <>
            <span className={styles.barName}>{bar.titulo}</span>
            <span className={styles.barBairro}>{bar.sub}</span>
          </>
        );
        return bar.href ? (
          <a
            key={bar.titulo}
            className={styles.barCard}
            style={style}
            href={bar.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {inner}
          </a>
        ) : (
          <div key={bar.titulo} className={styles.barCard} style={style}>
            {inner}
          </div>
        );
      };

      return (
        <ElectricBorder
          color="#7df9ff"
          speed={0.7}
          chaos={0.07}
          borderRadius={12}
        >
          <div className={styles.electricCard}>
            <div className={styles.celebrateLayout}>
              <div className={styles.barColumn}>
                {BARES_CELEBRACAO.slice(0, 2).map(renderBar)}
              </div>
              {cardInterno}
              <div className={styles.barColumn}>
                {BARES_CELEBRACAO.slice(2, 4).map(renderBar)}
              </div>
            </div>
          </div>
        </ElectricBorder>
      );
    }

    return <div className={`${styles.wrapper} gh-card`}>{cardInterno}</div>;
  }

  return (
    <div className={`${styles.wrapper} gh-card`}>
      <div className={styles.body}>
        <div className={styles.leftCol}>
          <span className={styles.sectionLabel}>Nota para atividades restantes</span>
          <div className={styles.pillRow}>
            <button
              className={`${styles.pill} ${!simulacao.manterAteOMomento ? styles.pillActive : ""}`}
              onClick={() =>
                onSimulacaoChange({ ...simulacao, manterAteOMomento: false })
              }
            >
              Hardcoded
            </button>
            <button
              className={`${styles.pill} ${simulacao.manterAteOMomento ? styles.pillActive : ""}`}
              onClick={() =>
                onSimulacaoChange({ ...simulacao, manterAteOMomento: true })
              }
            >
              Até o momento
            </button>
          </div>

          {!simulacao.manterAteOMomento && (
            <div className={styles.inputRow}>
              <label className={styles.inputGroup}>
                <span className={styles.inputLabel} style={{ color: "var(--color-ponderada)" }}>Pond.</span>
                <NumericInput
                  className={styles.input}
                  value={simulacao.notaAssumidaPonderada}
                  onChange={(v) =>
                    onSimulacaoChange({ ...simulacao, notaAssumidaPonderada: v ?? 0 })
                  }
                />
              </label>
              <label className={styles.inputGroup}>
                <span className={styles.inputLabel} style={{ color: "var(--color-artefato)" }}>Artef.</span>
                <NumericInput
                  className={styles.input}
                  value={simulacao.notaAssumidaArtefato}
                  onChange={(v) =>
                    onSimulacaoChange({ ...simulacao, notaAssumidaArtefato: v ?? 0 })
                  }
                />
              </label>
            </div>
          )}

          <div className={styles.partSection}>
            <div className={styles.partHeader}>
              <span className={styles.sectionLabel}>Participação</span>
              <button
                className={styles.iconBtn}
                onClick={() => setShowMultConfig(!showMultConfig)}
                title="Editar multiplicadores"
              >
                {showMultConfig ? <X size={11} /> : <Settings size={11} />}
              </button>
            </div>
            <div className={styles.selector}>
              {LETRAS.map((l) => (
                <button
                  key={l}
                  className={`${styles.letter} ${participacao === l ? styles.active : ""}`}
                  onClick={() => onParticipacaoChange(l)}
                >
                  {l}
                </button>
              ))}
            </div>

              {showMultConfig && (
              <div className={styles.configGrid}>
                {LETRAS.map((l) => (
                  <label key={l} className={styles.configRow}>
                    <span className={styles.configLetter}>{l}</span>
                    <NumericInput
                      className={styles.configInput}
                      value={multipliers[l]}
                      onChange={(v) =>
                        onMultipliersChange({ ...multipliers, [l]: v ?? 0 })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className={styles.miniMetrics}>
            <div className={styles.miniItem}>
              <span className={styles.miniLabel}>Projeção</span>
              <span className={styles.miniValue}>{fmtNota(metricas.acumuladoFinalProjetado)}</span>
            </div>
            <div className={styles.miniItem}>
              <span className={styles.miniLabel}>Não avaliado</span>
              <span className={styles.miniValue}>{(metricas.pontosNaoAvaliados * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.rightCol}>
          <div className={styles.provaBlock}>
            <span className={styles.provaLabel}>Nota necessária na prova</span>
            <span
              className={`${styles.provaValue} ${
                metricas.provaFeita ? styles.feita : provaClass
              }`}
            >
              {metricas.provaFeita
                ? "Feita"
                : metricas.provaStatus === "impossivel" ||
                    metricas.provaStatus === "folga"
                  ? fmtNota(metricas.notaNecessariaProvaRaw)
                  : fmtNota(metricas.notaNecessariaProva)}
            </span>
            <span className={`${styles.provaStatus} ${provaClass}`}>
              {provaLabel}
            </span>
          </div>

          <div className={styles.objectiveBlock}>
            <div className={styles.objectiveRow}>
              <span className={styles.objectiveLabel}>Objetivo final</span>
              <div className={styles.objectiveRight}>
                <span className={styles.objectiveValue}>{simulacao.metaFinal.toFixed(1)}</span>
                <button
                  className={styles.iconBtn}
                  onClick={() => setShowSlider(!showSlider)}
                  title="Editar objetivo"
                >
                  {showSlider ? <X size={11} /> : <Pencil size={11} />}
                </button>
              </div>
            </div>

            {showSlider && (
              <input
                className={styles.slider}
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={simulacao.metaFinal}
                onChange={(e) =>
                  onSimulacaoChange({
                    ...simulacao,
                    metaFinal: parseFloat(e.target.value),
                  })
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
