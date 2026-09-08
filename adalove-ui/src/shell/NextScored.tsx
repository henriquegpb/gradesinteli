import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { CATEGORY_COLOR } from "~/data/activityTypes";
import { nextScored } from "~/data/schedule";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { formatDate } from "~/lib/date";
import { ScoredTimelineModal } from "~/shell/ScoredTimelineModal";
import { Tooltip } from "~/ui/Tooltip";

// Régua do que ainda vale nota, no cabeçalho: três pontos numa linha, o título
// de cada um em cima e o primeiro com anel — é o próximo. A cor do ponto é a da
// categoria (a mesma tríade do donut de peso), então dá para ver de relance se o
// que vem é ponderada, artefato ou prova sem ler o título.
//
// Só o que TEM peso entra. O kanban tem 200 cards e a quase totalidade é
// material de leitura; misturar os dois transformaria a régua num relógio de
// autoestudo, que não é a pergunta que ela responde.

/** Quantas cabem na régua. Três é o que passa no vão entre o seletor de turma e
 *  os botões da direita sem espremer os títulos até virarem só reticências. */
const COUNT = 3;

/** Miolo do trilho, medido a partir da base da régua: os pontos são a última
 *  linha e têm 10px, então o centro deles está a 5px do fim. O chevron é
 *  pendurado nessa mesma altura — é o que o põe EM CIMA da linha, e não flutuando
 *  ao lado dela. */
const RAIL = 5;

/** Área de clique do chevron. O glifo tem 16px; a folga em volta existe só para
 *  o alvo não ser um ícone de 16px, e como é simétrica o centro do glifo
 *  continua exatamente sobre o trilho. */
const CHEVRON_HIT = 24;

function detail(a: ActivityView): string {
  const when = formatDate(a.date) ?? a.week;
  return `${a.caption} — ${when} · ${a.weight} ${a.weight === 1 ? "ponto" : "pontos"}`;
}

export function NextScored({
  view,
  onOpen,
}: {
  view: SectionView;
  onOpen: (activity: ActivityView) => void;
}) {
  const [full, setFull] = useState(false);
  const { items, rest } = nextScored(view, new Date(), COUNT);
  if (items.length === 0) return null;

  // Os pontos ficam no centro de colunas iguais, então o primeiro está a meia
  // coluna da borda esquerda e o último a meia coluna da direita. `solid` é onde
  // o trilho passa pelo último ponto — daí para a frente ele desbota, e é esse
  // rabo apagado que diz "ainda vem mais" sem gastar um quarto item.
  const half = 50 / items.length;
  const solid = ((100 - 2 * half) / (100 - half)) * 100;

  return (
    // Escondida abaixo de xl: com a sidebar aberta sobra pouco mais de 150px por
    // título, e três reticências lado a lado não informam nada.
    // O `pr` decide só onde a régua ACABA — o vão até a fileira de botões vem do
    // `right-2` do chevron, e por isso os dois se ajustam sem brigar: aqui a
    // linha vai quase até o glifo, e o respiro da direita continua o mesmo.
    <div className="relative hidden min-w-0 flex-1 basis-64 px-4 pr-8 xl:block">
      <ol
        aria-label="Próximas atividades com pontuação"
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {/* Trilho, com o miolo na altura do centro dos pontos. Vem antes na
            marcação de propósito: os itens são `relative`, então pintam por cima
            e a linha passa por trás das bolinhas. */}
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            bottom: RAIL - 1,
            height: 2,
            left: `${half}%`,
            right: rest > 0 ? 0 : `${half}%`,
            background:
              rest > 0
                ? `linear-gradient(to right, var(--color-line) ${solid}%, transparent)`
                : "var(--color-line)",
          }}
        />

        {items.map((activity, i) => {
          const color = CATEGORY_COLOR[activity.category] ?? "var(--color-fg-muted)";
          const next = i === 0;

          // O `li` é `flex` e não bloco: o wrapper do Tooltip é `inline-flex`, e
          // como caixa inline ele se apoiaria na linha de base do item — o vão do
          // strut acima empurraria a régua uns 9px para baixo do centro em que o
          // título e os botões estão. Como item de flex ele vira bloco, e a
          // altura passa a ser só a do conteúdo.
          return (
            <li key={activity.id} className="relative flex min-w-0">
              <Tooltip label={detail(activity)} className="w-full">
                <button
                  type="button"
                  onClick={() => onOpen(activity)}
                  className="group flex w-full min-w-0 cursor-pointer flex-col items-center gap-2.5 px-1.5 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "max-w-full truncate text-[0.7rem] leading-tight transition-colors duration-150 group-hover:text-fg group-focus-visible:text-fg",
                      next ? "text-fg" : "text-fg-soft",
                    )}
                  >
                    {activity.caption}
                  </span>
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full transition-transform duration-150 group-hover:scale-125 group-focus-visible:scale-125"
                    style={{
                      background: color,
                      // Anel só no primeiro. O vão é pintado com o fundo da
                      // página para o trilho não atravessar o miolo do anel.
                      boxShadow: next
                        ? `0 0 0 2px var(--color-bg), 0 0 0 3.5px ${color}`
                        : undefined,
                    }}
                  />
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ol>

      {/* Só o glifo, sentado na altura do trilho, onde a linha acaba de
          desbotar: o gesto é "seguir a linha até o fim", e o fim abre o módulo
          inteiro. Sem moldura de propósito — um botão redondo aqui viraria um
          sexto ícone competindo com a fileira da direita. */}
      {/* `flex` pelo mesmo motivo do `li` lá em cima: o wrapper do Tooltip é
          `inline-flex` e, como caixa inline, ficaria com o vão do descendente
          preso embaixo — o glifo subia uns 5px e saía de cima da linha. */}
      <span className="absolute right-2 flex" style={{ bottom: RAIL - CHEVRON_HIT / 2 }}>
        <Tooltip label="Ver a linha do tempo do módulo" disabled={full}>
          <button
            type="button"
            onClick={() => setFull(true)}
            aria-label="Ver a linha do tempo completa do módulo"
            style={{ width: CHEVRON_HIT, height: CHEVRON_HIT }}
            className="flex cursor-pointer items-center justify-center text-fg-muted transition-colors duration-150 hover:text-fg focus-visible:text-fg focus-visible:outline-none"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </Tooltip>
      </span>

      {full && (
        <ScoredTimelineModal
          view={view}
          onClose={() => setFull(false)}
          onOpenActivity={(activity) => {
            setFull(false);
            onOpen(activity);
          }}
        />
      )}
    </div>
  );
}
