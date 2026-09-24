import { ChevronDown } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { sanitizeTextOrHtml } from "~/lib/sanitize";

/** ~10 linhas de `text-sm leading-relaxed`. Acima disso o enunciado empurra o
 *  resto do modal para fora da vista. */
const CLAMP_PX = 232;

/** Conteúdo do Adalove com "Ver mais", igual ao deles. O corte é medido, não
 *  chutado por contagem de caracteres: o HTML tem listas, títulos e imagens, e
 *  contar caracteres erraria feio.
 *
 *  Aceita HTML ou texto puro: enunciado e descrição vêm marcados, feedback,
 *  resposta e a argumentação do pedido de revisão nem sempre. */
export function Html({ html }: { html: string }) {
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
