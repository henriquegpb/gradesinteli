import { ClipboardCopy } from "lucide-react";
import { buildPrompt } from "~/ai/prompt";
import { AI_PROVIDERS, MAX_URL_PROMPT_CHARS, type AiProvider } from "~/ai/providers";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { Logo } from "~/lib/logos";
import { copyText } from "~/lib/prefs";
import { useToast } from "~/ui/Toast";

/** Um botão por modelo, sem dropdown: o destino fica óbvio e some a necessidade
 *  de guardar preferência e de um menu com clique-fora dentro do shadow root. */
export function AskAiButtons({
  activity,
  view,
  size = "md",
  className,
}: {
  activity: ActivityView;
  view: SectionView;
  size?: "sm" | "md";
  className?: string;
}) {
  const toast = useToast();
  const box = size === "sm" ? "size-7" : "size-9";
  const icon = size === "sm" ? 14 : 17;

  async function ask(target: AiProvider) {
    const prompt = buildPrompt(activity, view);
    // Gemini não tem parâmetro de prefill; prompt gigante seria truncado em
    // silêncio pelo destino. Nos dois casos, clipboard é mais honesto que URL.
    const viaClipboard = !target.supportsPrefill || prompt.length > MAX_URL_PROMPT_CHARS;

    if (viaClipboard) {
      const copied = await copyText(prompt);
      window.open(target.buildUrl(prompt), "_blank", "noopener,noreferrer");
      toast.toast(
        copied
          ? `Prompt copiado. Cole no ${target.label}.`
          : `Não consegui copiar. Abra o ${target.label} e descreva a atividade.`,
        copied ? "success" : "error",
      );
      return;
    }
    window.open(target.buildUrl(prompt), "_blank", "noopener,noreferrer");
  }

  async function copyOnly() {
    const ok = await copyText(buildPrompt(activity, view));
    toast.toast(
      ok ? "Prompt copiado." : "Não consegui acessar a área de transferência.",
      ok ? "success" : "error",
    );
  }

  const buttonClass = cn(
    box,
    "inline-flex items-center justify-center rounded-control border border-line bg-surface",
    "text-fg-soft transition-colors duration-150 hover:border-accent hover:bg-surface-hover",
  );

  return (
    <div className={cn("flex items-center gap-1.5", className)} role="group" aria-label="Explicar com IA">
      {AI_PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          type="button"
          title={`Explicar com ${provider.label}: abre em outra aba${provider.supportsPrefill ? "" : ", copiando o prompt"}`}
          aria-label={`Explicar com ${provider.label}`}
          onClick={(e) => {
            e.stopPropagation();
            void ask(provider);
          }}
          className={buttonClass}
        >
          <Logo name={provider.logo} size={icon} />
        </button>
      ))}
      <button
        type="button"
        title="Copiar prompt"
        aria-label="Copiar prompt"
        onClick={(e) => {
          e.stopPropagation();
          void copyOnly();
        }}
        className={cn(buttonClass, "text-fg-muted hover:text-fg")}
      >
        <ClipboardCopy size={icon - 3} aria-hidden />
      </button>
    </div>
  );
}
