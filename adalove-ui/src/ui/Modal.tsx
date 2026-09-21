import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "~/lib/cn";
import { useScrollLock } from "~/lib/scrollLock";

/** Sem portal de propósito: a overlay já é um host fixed full-screen, então um
 *  `fixed` aqui dentro se posiciona pela viewport e continua isolado no shadow root. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  titleAside,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  /** Encostado no bloco de identificação (ícone, título, subtítulo), à direita
   *  dele. Para um segundo campo da primeira linha — a nota de uma atividade
   *  corrigida. Fica DENTRO do bloco, e não no canto do cabeçalho, para o
   *  divisor separar os dois campos em vez de flutuar longe do que divide. */
  titleAside?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          // Altura fixa: sem isso o modal pulava de tamanho a cada troca de aba.
          "relative z-[71] flex h-[85dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-2xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon}
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">{title}</div>
              {subtitle ? (
                <div className="mt-0.5 text-xs text-fg-muted">{subtitle}</div>
              ) : null}
            </div>
            {titleAside}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-fg-soft transition-colors duration-150 hover:border-accent hover:text-fg"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer ? (
          <div className="border-t border-line px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
