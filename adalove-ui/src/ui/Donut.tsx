import { cn } from "~/lib/cn";

// Donut em SVG puro — receita do GradesInteli (r=42, stroke 16), com a legenda
// ao lado. Nasceu na "Distribuição do peso" da Visão geral; virou componente
// quando a tela de prova final passou a mostrar a distribuição de aulas por
// matéria, que é o MESMO desenho com outro dado.

export interface DonutSlice {
  /** Identidade estável da fatia, quando o rótulo pode se repetir — duas
   *  matérias caem no mesmo nome sempre que ele vem do eixo ("COM" duas vezes),
   *  e com chave repetida o React reaproveita o nó da primeira e a legenda sai
   *  fora de ordem. Sem isso vale o rótulo, que nas categorias de nota é único. */
  id?: string;
  label: string;
  value: number;
  color: string;
  /** Segunda linha da legenda: professor, eixo — o que qualifica a fatia. */
  sub?: string;
  /** Fatia de apoio: entra esmaecida para a que importa saltar aos olhos.
   *  Marcar alguma também põe a legenda das outras em contraste cheio. */
  dim?: boolean;
}

/** Opacidade das fatias de apoio. Abaixo disso a cor some no anel de fundo e a
 *  legenda perde a correspondência com o gráfico. */
const DIM_OPACITY = 0.55;

export function Donut({
  slices,
  center,
  formatValue = (v) => String(v),
  size = 110,
  dense = false,
}: {
  slices: DonutSlice[];
  /** Miolo do anel: número grande em cima, rótulo miúdo embaixo. */
  center: { value: string; label: string };
  /** Como o valor aparece na legenda — peso em pontos, contagem de aulas… */
  formatValue?: (value: number) => string;
  size?: number;
  /** Legenda espremida: linhas coladas e colunas justas. Para quando o anel é
   *  grande e a legenda tem que caber ao lado dele sem virar uma lista alta. */
  dense?: boolean;
}) {
  // A espessura acompanha o diâmetro: 16px em 110px é a receita original, e é
  // essa proporção que o anel grande precisa manter para não virar um aro fino.
  const stroke = Math.round(size * 0.145);
  const r = (size - stroke) / 2;
  // Acima de certo tamanho o miolo comporta (e pede) um número maior.
  const big = size >= 160;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const emphasis = slices.some((s) => s.dim);

  let offset = 0;
  return (
    <div className={cn("flex items-center", dense ? "gap-3" : "gap-4")}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {/* A legenda carrega os mesmos números, então o desenho é decoração
            para quem lê por voz. */}
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-line-soft)"
            strokeWidth={stroke}
          />
          {total > 0 &&
            slices.map((s) => {
              const length = (s.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const el = (
                <circle
                  key={s.id ?? s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  opacity={s.dim ? DIM_OPACITY : 1}
                />
              );
              offset += length;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          <span
            className={cn(
              "font-mono font-medium text-fg tabular",
              big ? "text-3xl tracking-tight" : "text-base",
            )}
          >
            {center.value}
          </span>
          <span
            className={cn(
              "max-w-full truncate uppercase tracking-[0.04em] text-fg-muted",
              big ? "mt-0.5 text-[0.7rem]" : "text-[0.5rem]",
            )}
          >
            {center.label}
          </span>
        </div>
      </div>
      <ul className={cn("min-w-0 flex-1", dense ? "space-y-0.5" : "space-y-1.5")}>
        {slices.map((s) => (
          <li
            key={s.id ?? s.label}
            className={cn("flex items-center gap-2", dense ? "text-[0.7rem]" : "text-xs")}
          >
            <span
              aria-hidden
              className={cn("shrink-0 rounded-full", dense ? "size-1.5" : "size-2")}
              style={{ background: s.color, opacity: s.dim ? DIM_OPACITY : 1 }}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate",
                  emphasis && !s.dim ? "font-medium text-fg" : "text-fg-soft",
                )}
              >
                {s.label}
              </span>
              {s.sub && (
                <span className="block truncate text-[0.58rem] text-fg-muted">{s.sub}</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-fg tabular">{formatValue(s.value)}</span>
            <span
              className={cn(
                "shrink-0 text-right font-mono text-fg-muted tabular",
                dense ? "w-7 text-[0.6rem]" : "w-10 text-[0.62rem]",
              )}
            >
              {total > 0 ? `${((s.value / total) * 100).toFixed(0)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
