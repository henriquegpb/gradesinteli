import { useMemo } from "react";
import { useApi } from "~/data/api";
import { renderAdalovePage } from "~/lib/adalovePage";
import { sanitizeHtml } from "~/lib/sanitize";
import { Card } from "~/ui/Card";
import { Skeleton } from "~/ui/Skeleton";

// Uma tela para as quatro páginas de conteúdo do Adalove: todas devolvem
// `{ content }` em Markdown no mesmo endpoint `/pages/slug/{slug}`.

export const PAGE_SLUGS = {
  library: "Biblioteca",
  "institutional-norms": "Normas institucionais",
  calendar: "Calendário acadêmico",
  tools: "Ferramentas",
} as const;

export type PageSlug = keyof typeof PAGE_SLUGS;

/** A página já tem `<h1>` próprio; quando o conteúdo abre repetindo o título, o
 *  resultado é o nome duas vezes seguidas.
 *
 *  A regra é "o título já diz isso?": remove quando o nosso título contém o
 *  cabeçalho ("Calendário" dentro de "Calendário acadêmico"), e mantém quando o
 *  cabeçalho acrescenta — a Biblioteca abre com o nome completo, "Biblioteca
 *  Clarisse Sieckenius de Souza", que é informação e fica. */
function dropRedundantTitle(content: string, title: string): string {
  const norm = (t: string) =>
    t
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  return content.replace(/^\s*#\s+(.+?)\s*$/m, (line, heading: string) =>
    norm(title).includes(norm(heading)) ? "" : line,
  );
}

export function Pagina({ slug }: { slug: PageSlug }) {
  const { data, loading, error } = useApi<{ content?: string }>(`/pages/slug/${slug}`);

  const html = useMemo(() => {
    if (!data?.content) return "";
    return sanitizeHtml(renderAdalovePage(dropRedundantTitle(data.content, PAGE_SLUGS[slug])));
  }, [data?.content, slug]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-fg">{PAGE_SLUGS[slug]}</h1>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-40" />
        </div>
      )}

      {error && (
        <Card className="p-6">
          <p className="text-sm text-red">{error.message}</p>
        </Card>
      )}

      {html && (
        <Card className="p-6">
          <div
            className="adalove-prose adalove-page text-sm leading-relaxed text-fg-soft"
            // Sanitizado: sem script/iframe/handlers inline.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Card>
      )}

      {data && !html && (
        <Card className="p-6">
          <p className="text-sm text-fg-muted">Esta página está vazia no Adalove.</p>
        </Card>
      )}
    </div>
  );
}
