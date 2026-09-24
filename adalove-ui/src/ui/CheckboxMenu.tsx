import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";

// Seleção múltipla num menu: o botão diz quantos estão marcados e o painel
// abre a lista inteira com caixas.
//
// Não é `<select multiple>`: o nativo obriga ctrl+clique para marcar mais de
// um, não cabe uma segunda linha por item e some no shadow root com o CSS da
// página. Aqui cada linha é um botão com `role="checkbox"`, que é o que um
// leitor de tela espera encontrar.

export interface CheckboxOption {
  id: string;
  label: string;
  /** Segunda linha, miúda: semana, peso, o que qualificar o item. */
  sub?: string;
}

export function CheckboxMenu({
  options,
  selected,
  onToggle,
  onAll,
  noun,
  className,
}: {
  options: CheckboxOption[];
  /** Ids marcados. */
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAll: (select: boolean) => void;
  /** Como contar no botão: "aulas", "matérias"… */
  noun: [singular: string, plural: string];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // `composedPath` enxerga através do shadow root; `target` seria sempre o host.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !e.composedPath().includes(wrapRef.current)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const count = options.filter((o) => selected.has(o.id)).length;
  const todas = count === options.length;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 w-full items-center gap-2 rounded-control border bg-bg px-3 text-sm transition-colors duration-150",
          open ? "border-accent text-fg" : "border-line text-fg hover:border-accent",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="font-mono tabular">{count}</span> de{" "}
          <span className="font-mono tabular">{options.length}</span>{" "}
          {options.length === 1 ? noun[0] : noun[1]}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={cn(
            "shrink-0 text-fg-muted transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-72 overflow-hidden rounded-card border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">
              {count} marcad{count === 1 ? "a" : "as"}
            </span>
            <button
              type="button"
              onClick={() => onAll(!todas)}
              className="text-[0.62rem] text-accent transition-opacity hover:opacity-80"
            >
              {todas ? "desmarcar todas" : "marcar todas"}
            </button>
          </div>

          {/* Teto de altura: a lista de uma matéria pode passar de vinte itens,
              e um menu do tamanho da página não é mais um menu. */}
          <ul className="max-h-72 overflow-y-auto py-1">
            {options.map((option) => {
              const on = selected.has(option.id);
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => onToggle(option.id)}
                    className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                        on ? "border-accent bg-accent text-white" : "border-line bg-bg",
                      )}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn("block text-xs leading-snug", on ? "text-fg" : "text-fg-muted")}
                      >
                        {option.label}
                      </span>
                      {option.sub && (
                        <span className="block text-[0.58rem] text-fg-muted">{option.sub}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
