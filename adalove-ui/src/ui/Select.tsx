import { ChevronDown } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "~/lib/cn";

/** `<select>` nativo estilizado: dentro de shadow root o popup do sistema
 *  continua funcionando, o que um dropdown custom teria que reimplementar. */
export function Select({
  className,
  children,
  ...props
}: ComponentPropsWithRef<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "block h-9 w-full appearance-none rounded-control border border-line bg-bg pl-3 pr-8 text-sm text-fg outline-none transition-colors duration-150",
          "focus:border-accent",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
      />
    </div>
  );
}
