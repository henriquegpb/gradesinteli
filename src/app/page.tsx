"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { Download } from "lucide-react";
import { useGradeDashboard } from "@/hooks/useGradeDashboard";
import StudentHeader from "@/components/dashboard/StudentHeader";
import HtmlUpload from "@/components/import/HtmlUpload";
import GithubStarButton from "@/components/import/GithubStarButton";
import StarPromptModal from "@/components/import/StarPromptModal";
import { useStarPrompt } from "@/hooks/useStarPrompt";
import MetricCard from "@/components/dashboard/MetricCard";
import DistributionChart from "@/components/dashboard/DistributionChart";
import ProgressBars from "@/components/dashboard/ProgressBars";
import AttendanceCard from "@/components/dashboard/AttendanceCard";
import ActivitiesTable from "@/components/table/ActivitiesTable";
import UnknownActivitiesPanel from "@/components/table/UnknownActivitiesPanel";
import SimulationPanel from "@/components/simulation/SimulationPanel";
import { fmtNota } from "@/lib/format";
import styles from "./page.module.css";

export default function Home() {
  const {
    items, naoReconhecidas, simulacao, setSimulacao,
    studentName, lastImportAt, metricas, importError, isHydrated,
    importHtml, updateNota, vincularManualmente, resetAll,
    participacao, setParticipacao,
    participacaoMultipliers, setParticipacaoMultipliers,
    theme, toggleTheme,
    effectiveMetaFinal,
    attendance, importAttendanceHtml, attendanceError,
    attendanceUltimaPeso2, setAttendanceUltimaPeso2Flag,
  } = useGradeDashboard();

  const [dragging, setDragging] = useState(false);
  const [ghGlow, setGhGlow] = useState(false);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [browser, setBrowser] = useState<"chrome" | "safari">("chrome");
  const [showManual, setShowManual] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  const CWS_URL = "https://chromewebstore.google.com/detail/dpgoggjeajlgbkfabfhijccjfbchojpn";

  useEffect(() => {
    const ua = navigator.userAgent;
    const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
    if (safari) {
      setIsSafari(true);
      setBrowser("safari");
      setShowManual(true); // Safari não usa a extensão — já mostra o manual
    }
  }, []);
  const dragCounter = useRef(0);

  const BOOKMARKLET_CODE =
    "javascript:(function(){var a=document.querySelector('img.MuiAvatar-img'),t=document.querySelector('table');if(!t){alert('Tabela n\\u00e3o encontrada. V\\u00e1 \\u00e0 aba Notas do ADALove com as atividades carregadas.');return;}var h='<!DOCTYPE html><html><body>'+(a?a.outerHTML:'')+t.outerHTML+'<\\/body><\\/html>',b=new Blob([h],{type:'text\\/html;charset=utf-8'}),u=URL.createObjectURL(b),l=document.createElement('a');l.href=u;l.download='adalove.html';document.body.appendChild(l);l.click();document.body.removeChild(l);setTimeout(function(){URL.revokeObjectURL(u);},100);})();";

  const copyBookmarklet = useCallback(() => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE).then(() => {
      setBookmarkletCopied(true);
      setTimeout(() => setBookmarkletCopied(false), 2000);
    });
  }, [BOOKMARKLET_CODE]);

  const starPrompt = useStarPrompt(isHydrated, items.length > 0, lastImportAt);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith(".html") || file.name.endsWith(".htm"))) {
        importHtml(file);
      }
    },
    [importHtml]
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) importHtml(file);
      e.target.value = "";
    },
    [importHtml]
  );

  if (!isHydrated) return null;

  const hasData = items.length > 0;

  const upload = (
    <div className={styles.headerActions}>
      {hasData && (
        <GithubStarButton onHoverChange={setGhGlow} onStarClick={starPrompt.markStarClicked} />
      )}
      {hasData && (
        <a
          href={CWS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.installExtensionBtn}
          title="Instalar extensão"
        >
          <Download size={13} strokeWidth={2} aria-hidden="true" />
          <span>Instalar extensão</span>
        </a>
      )}
      {hasData && <HtmlUpload onImport={importHtml} error={importError} />}
      <button
        className={styles.themeBtn}
        onClick={toggleTheme}
        title={theme === "dark" ? "Modo claro" : "Modo escuro"}
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>
    </div>
  );

  if (!hasData || !metricas) {
    return (
      <div
        className={styles.emptyContainer}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={styles.skeleton} aria-hidden="true">
          <div className={styles.skelMain}>
            <div className={styles.skelRow2}>
              <div className={styles.skelCard} />
              <div className={styles.skelCard} />
            </div>
            <div className={styles.skelRow3}>
              <div className={`${styles.skelCard} ${styles.skelPonderada}`} />
              <div className={`${styles.skelCard} ${styles.skelArtefato}`} />
              <div className={`${styles.skelCard} ${styles.skelProva}`} />
            </div>
            <div className={styles.skelRowCharts}>
              <div className={`${styles.skelCard} ${styles.skelTall}`} />
              <div className={`${styles.skelCard} ${styles.skelTall}`} />
            </div>
            <div className={`${styles.skelCard} ${styles.skelPanel}`} />
          </div>
          <div className={styles.skelSidebar}>
            <div className={`${styles.skelCard} ${styles.skelTableHead}`} />
            <div className={`${styles.skelCard} ${styles.skelTable}`} />
          </div>
        </div>
        <StudentHeader
          studentName={studentName}
          lastImportAt={lastImportAt}
          uploadSlot={upload}
        />
        <div className={`${styles.emptyState} ${dragging ? styles.emptyDragging : ""}`}>
          <a
            href={CWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.extensionCta}
          >
            <span className={styles.extensionCtaIcon}>⬇</span>
            <span className={styles.extensionCtaText}>
              <strong>Baixar a extensão</strong>
              <span>Importe suas notas com 1 clique direto do Adalove</span>
            </span>
          </a>
          <p className={styles.extensionNote}>
            {isSafari ? (
              <>
                A extensão <strong>não funciona no Safari</strong>. Use a
                importação manual abaixo.
              </>
            ) : (
              <>Funciona no Chrome, Edge, Brave e outros navegadores Chromium.</>
            )}
          </p>

          <div className={styles.dropDivider}>
            <span>ou</span>
          </div>

          <button
            className={styles.manualToggle}
            onClick={() => setShowManual((o) => !o)}
            aria-expanded={showManual}
          >
            <span>Importe manualmente (salvar HTML)</span>
            <span className={`${styles.manualChevron} ${showManual ? styles.manualChevronOpen : ""}`}>
              ›
            </span>
          </button>

          <div className={`${styles.collapsible} ${showManual ? styles.collapsibleOpen : ""}`}>
            <div className={styles.collapsibleInner}>
              <div className={styles.manualBody}>
                <div className={styles.browserToggle}>
                  <button
                    className={`${styles.browserBtn} ${browser === "chrome" ? styles.browserBtnActive : ""}`}
                    onClick={() => setBrowser("chrome")}
                  >
                    Chrome / Firefox
                  </button>
                  <button
                    className={`${styles.browserBtn} ${browser === "safari" ? styles.browserBtnActive : ""}`}
                    onClick={() => setBrowser("safari")}
                  >
                    Safari
                  </button>
                </div>

                {browser === "chrome" ? (
                  <ol className={styles.emptySteps}>
                    <li>
                      Acesse o{" "}
                      <a href="https://adalove.inteli.edu.br" target="_blank" rel="noopener noreferrer" className={styles.emptyLink}>
                        Adalove
                      </a>{" "}
                      e vá até a aba <strong>Notas</strong>.
                    </li>
                    <li>
                      Confirme que todas as atividades e pontuações estão carregadas.
                    </li>
                    <li>
                      Pressione <kbd className={styles.kbd}>Ctrl+S</kbd> (Windows) ou{" "}
                      <kbd className={styles.kbd}>⌘S</kbd> (Mac) e escolha{" "}
                      <em>&quot;Página da Web completa&quot;</em>.
                    </li>
                    <li>
                      Arraste o arquivo <code>.html</code> para a área acima,
                      ou clique nela para selecionar.
                    </li>
                  </ol>
                ) : (
                  <ol className={styles.emptySteps}>
                    <li>
                      Clique em <strong>Copiar código</strong> abaixo.
                    </li>
                    <li>
                      Pressione <kbd className={styles.kbd}>⌘D</kbd> → local{" "}
                      <em>&quot;Barra de favoritos&quot;</em> → <em>Adicionar</em>.
                    </li>
                    <li>
                      Clique com botão direito no
                      favorito → <em>&quot;Editar endereço&quot;</em> → cole o código.
                    </li>
                    <li>
                      No Adalove, aba <strong>Notas</strong> → clique no favorito
                      para baixar → importe aqui.
                    </li>
                  </ol>
                )}

                {browser === "safari" && (
                  <div className={styles.bookmarkletRow}>
                    <button className={styles.bookmarkletCopy} onClick={copyBookmarklet}>
                      {bookmarkletCopied ? "Copiado!" : "Copiar código"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className={styles.dropZone}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className={styles.dropIcon}>↓</span>
            <span className={styles.dropText}>
              Arraste o arquivo HTML aqui ou clique para selecionar
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm"
            onChange={onPickFile}
            style={{ display: "none" }}
          />

          {importError && <p className={styles.importErrorMsg}>{importError}</p>}

          <p className={styles.emptyHint}>
            Seus dados ficam salvos no navegador. Nada é enviado para nenhum servidor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.shell} ${ghGlow ? "gh-glow-active" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className={styles.dragOverlay}>
          <span className={styles.dragOverlayText}>Solte para atualizar notas</span>
        </div>
      )}
      <StarPromptModal
        open={starPrompt.isOpen}
        onStar={starPrompt.onStar}
        onDismiss={starPrompt.onDismiss}
      />
      <StudentHeader
        studentName={studentName}
        lastImportAt={lastImportAt}
        uploadSlot={upload}
      />

      <div className={styles.dashboard}>
        <div className={styles.main}>
          <div className={styles.metricsGrid}>
            <MetricCard
              label="Total acumulado"
              value={fmtNota(metricas.acumuladoTotal, 3)}
              valueSuffix={`/ ${fmtNota(metricas.pontosAvaliados * 10, 3)} avaliados`}
            />
            <MetricCard
              label="Média até o momento"
              value={
                metricas.mediaTotalAteOMomento !== null
                  ? fmtNota(metricas.mediaTotalAteOMomento)
                  : "—"
              }
            />
          </div>

          <div className={styles.categoryCards}>
            <div className={`${styles.dualCard} gh-card`} style={{ borderTopColor: "var(--color-ponderada)" }}>
              <span className={styles.dualLabel}>Ponderadas</span>
              <div className={styles.dualBody}>
                <div className={styles.dualCol}>
                  <span className={styles.dualSubLabel}>Acumulado</span>
                  <span className={styles.dualValue}>{fmtNota(metricas.acumuladoPonderadas, 3)}</span>
                </div>
                <div className={styles.dualDivider} />
                <div className={styles.dualCol}>
                  <span className={styles.dualSubLabel}>Até o momento</span>
                  <span className={styles.dualValue}>
                    {metricas.mediaPonderadasAteOMomento !== null ? fmtNota(metricas.mediaPonderadasAteOMomento) : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className={`${styles.dualCard} gh-card`} style={{ borderTopColor: "var(--color-artefato)" }}>
              <span className={styles.dualLabel}>Artefatos</span>
              <div className={styles.dualBody}>
                <div className={styles.dualCol}>
                  <span className={styles.dualSubLabel}>Acumulado</span>
                  <span className={styles.dualValue}>{fmtNota(metricas.acumuladoArtefatos, 3)}</span>
                </div>
                <div className={styles.dualDivider} />
                <div className={styles.dualCol}>
                  <span className={styles.dualSubLabel}>Até o momento</span>
                  <span className={styles.dualValue}>
                    {metricas.mediaArtefatosAteOMomento !== null ? fmtNota(metricas.mediaArtefatosAteOMomento) : "—"}
                  </span>
                </div>
              </div>
            </div>
            {/* Autoavaliação existe em GRAD SI (Autoavaliação + Avaliação em
                pares) e não em GRAD CC: sem peso, o card não aparece. */}
            {(metricas.pesosPorTipo["Autoavaliação"] ?? 0) > 0 && (
              <div
                className={`${styles.dualCard} gh-card`}
                style={{ borderTopColor: "var(--color-autoavaliacao)" }}
              >
                <span className={styles.dualLabel}>Autoavaliação</span>
                <div className={styles.dualBody}>
                  <div className={styles.dualCol}>
                    <span className={styles.dualSubLabel}>Acumulado</span>
                    <span className={styles.dualValue}>
                      {fmtNota(metricas.acumuladoAutoavaliacao, 3)}
                    </span>
                  </div>
                  <div className={styles.dualDivider} />
                  <div className={styles.dualCol}>
                    <span className={styles.dualSubLabel}>Até o momento</span>
                    <span className={styles.dualValue}>
                      {metricas.mediaAutoavaliacaoAteOMomento !== null
                        ? fmtNota(metricas.mediaAutoavaliacaoAteOMomento)
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className={`${styles.dualCard} gh-card`} style={{ borderTopColor: "var(--color-prova)" }}>
              <span className={styles.dualLabel}>Prova</span>
              <div className={styles.dualBody}>
                <div className={styles.dualCol}>
                  <span className={styles.dualSubLabel}>Acumulado</span>
                  <span className={styles.dualValue}>{fmtNota(metricas.acumuladoProva, 3)}</span>
                </div>
                <div className={styles.dualDivider} />
                <div className={styles.dualCol}>
                  <span className={styles.dualSubLabel}>Até o momento</span>
                  <span className={styles.dualValue}>
                    {metricas.mediaProvaAteOMomento !== null ? fmtNota(metricas.mediaProvaAteOMomento) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.chartsRow}>
            <div className={`${styles.combinedCard} gh-card`}>
              <div className={styles.combinedLeft}>
                <DistributionChart pesosPorTipo={metricas.pesosPorTipo} bare />
              </div>
              <div className={styles.combinedDivider} />
              <div className={styles.combinedRight}>
                <ProgressBars items={items} bare />
              </div>
            </div>
            <AttendanceCard
              attendance={attendance}
              onImport={importAttendanceHtml}
              error={attendanceError}
              ultimaPeso2={attendanceUltimaPeso2}
              onUltimaPeso2Change={setAttendanceUltimaPeso2Flag}
            />
          </div>

          <SimulationPanel
            simulacao={simulacao}
            onSimulacaoChange={setSimulacao}
            metricas={metricas}
            participacao={participacao}
            multipliers={participacaoMultipliers}
            onParticipacaoChange={setParticipacao}
            onMultipliersChange={setParticipacaoMultipliers}
            effectiveMetaFinal={effectiveMetaFinal}
            attendance={attendance}
          />

          {naoReconhecidas.length > 0 && (
            <UnknownActivitiesPanel
              naoReconhecidas={naoReconhecidas}
              onVincular={vincularManualmente}
            />
          )}

          <div className={styles.footer}>
            <span className={styles.credit}>
              Criado por{" "}
              <a
                href="https://github.com/henriquegpb"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.creditLink}
              >
                Henrique Barone
              </a>
              {" · inspirado na famosa "}
              <a
                href="https://docs.google.com/spreadsheets/d/1PmS8W2Wg32J6AM097Om1dvlKDnFfx0FmIF6EjEY7H7E/edit?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.creditLink}
              >
                planilha
              </a>
            </span>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <ActivitiesTable items={items} onNotaChange={updateNota} />
        </aside>
      </div>
    </div>
  );
}
