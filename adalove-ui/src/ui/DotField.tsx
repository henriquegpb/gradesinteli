import { useEffect, useRef } from "react";
import { cn } from "~/lib/cn";

// Malha de pontos que respira sozinha e acende perto do cursor. Mora atrás do
// cartão de login — a única tela da overlay sem conteúdo para preencher a
// página, que sem isto ficava um retângulo no meio do preto.
//
// Canvas e não DOM: são ~1.200 pontos redesenhados a cada quadro, e 1.200 nós
// com `transform` fariam o layout do navegador trabalhar à toa.

/** Distância entre pontos. Menos que isto vira textura, mais vira xadrez. */
const GAP = 30;
/** Alcance do cursor. Generoso de propósito: o brilho tem que se anunciar antes
 *  de a pessoa passar por cima. */
const REACH = 170;
const BASE_RADIUS = 1;
const BASE_ALPHA = 0.28;

/** A malha inteira desliza JUNTA, com um deslocamento só para todos os pontos.
 *  Mover cada ponto com fase própria dava movimento mais orgânico, mas quebrava
 *  as linhas: de longe a grade aparecia torta, e uma grade torta lê como erro,
 *  não como enfeite. O que varia por ponto é só o brilho, que não desalinha
 *  nada. */
const DRIFT = 7;
const DRIFT_SPEED = 0.00006;
/** Onda lenta de brilho na diagonal — é o que dá vida sem mexer em posição. */
const WAVE_SPEED = 0.0004;
const WAVE_STEP = 0.32;

interface Dot {
  x: number;
  y: number;
  /** Fase da onda de brilho, tirada da posição na grade: assim a variação
   *  atravessa o campo na diagonal em vez de piscar tudo ao mesmo tempo. */
  wave: number;
  /** Guardado por ponto para o brilho decair depois que o cursor passa, em vez
   *  de apagar de um quadro para o outro. */
  glow: number;
}

function readColor(el: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

/** `#2686ff` → `38,134,255`, para entrar em `rgba()` com alfa variável. Aceita
 *  também a forma já em `rgb()`, caso o tema mude de notação. */
function toRgb(color: string): string {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    const n = parseInt(full, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  const parts = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  return parts ? `${parts[1]},${parts[2]},${parts[3]}` : "38,134,255";
}

export function DotField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const accent = toRgb(readColor(canvas, "--color-accent", "#2686ff"));
    const muted = toRgb(readColor(canvas, "--color-fg-muted", "#6b6b78"));

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    // Fora da tela até o primeiro movimento: sem isto, a lâmpada nasceria no
    // canto superior esquerdo antes de alguém encostar no mouse.
    let pointer = { x: -9999, y: -9999 };
    let frame = 0;

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width === 0 || height === 0) return;

      // O canvas desenha em pixels do dispositivo e é exibido em CSS pixels:
      // sem a escala, a malha sai borrada em tela retina.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots = [];
      // Uma fileira a mais em cada lado, fora da tela: como a malha inteira
      // desliza, sem essa margem apareceria uma faixa vazia na borda de onde ela
      // vem. Centralizada para não encostar de um lado e sobrar do outro.
      const cols = Math.ceil(width / GAP) + 2;
      const rows = Math.ceil(height / GAP) + 2;
      const originX = (width - (cols - 1) * GAP) / 2;
      const originY = (height - (rows - 1) * GAP) / 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          dots.push({
            x: originX + col * GAP,
            y: originY + row * GAP,
            wave: (col + row) * WAVE_STEP,
            glow: 0,
          });
        }
      }
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Um deslocamento só, aplicado a todos: as linhas continuam retas.
      const shiftX = calm ? 0 : Math.sin(time * DRIFT_SPEED) * DRIFT;
      const shiftY = calm ? 0 : Math.cos(time * DRIFT_SPEED * 0.8) * DRIFT;

      for (const dot of dots) {
        const x = dot.x + shiftX;
        const y = dot.y + shiftY;

        const dx = x - pointer.x;
        const dy = y - pointer.y;
        // Sem `sqrt`: comparar quadrados dá a mesma resposta e este laço roda
        // mil vezes por quadro.
        const distance2 = dx * dx + dy * dy;
        const target = distance2 > REACH * REACH ? 0 : 1 - Math.sqrt(distance2) / REACH;

        // Sobe rápido e desce devagar: o rastro do cursor fica visível por um
        // instante, que é o que faz a malha parecer iluminada e não pintada.
        dot.glow += (target - dot.glow) * (target > dot.glow ? 0.35 : 0.06);

        const glow = dot.glow;
        const pulse = calm ? 1 : 0.72 + 0.28 * Math.sin(time * WAVE_SPEED + dot.wave);
        const radius = BASE_RADIUS + glow * 1.7;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle =
          glow > 0.01
            ? `rgba(${accent},${BASE_ALPHA + glow * 0.72})`
            : `rgba(${muted},${BASE_ALPHA * pulse})`;
        ctx.fill();

        // Halo só nos poucos pontos mais próximos: é o que dá a sensação de luz,
        // e é caro demais para valer em toda a malha.
        if (glow > 0.45) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 5 * glow, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${accent},${(glow - 0.45) * 0.16})`;
          ctx.fill();
        }
      }

      frame = requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerLeave = () => {
      pointer = { x: -9999, y: -9999 };
    };

    build();
    frame = requestAnimationFrame(draw);

    // No documento, não no canvas: ele é `pointer-events: none` (o cartão em
    // cima precisa receber os cliques), então nunca veria o mouse. E o mundo
    // isolado do content script enxerga os eventos da página normalmente.
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    const observer = new ResizeObserver(build);
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
