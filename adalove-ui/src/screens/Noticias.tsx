import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useApi } from "~/data/api";
import { normalizeNews, relativeTime, type NewsItem } from "~/data/news";
import { formatDate } from "~/lib/date";
import { sanitizeHtml } from "~/lib/sanitize";
import { Badge } from "~/ui/Badge";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { Modal } from "~/ui/Modal";
import { Skeleton } from "~/ui/Skeleton";

const PER_PAGE = 10;

interface PostsResponse {
  meta?: { totalPages?: number; currentPage?: number; totalItems?: number };
}

function NewsRow({ item, onOpen }: { item: NewsItem; onOpen: (n: NewsItem) => void }) {
  return (
    <Card className="p-4 transition-colors duration-150 hover:border-accent/50">
      <button type="button" onClick={() => onOpen(item)} className="w-full text-left">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.62rem]">
          <span className="text-fg-muted">{relativeTime(item.date) ?? ""}</span>
          {item.author && <span className="text-purple">{item.author}</span>}
          {item.categories.map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
        </div>
        {item.title && <div className="mt-1.5 text-sm font-medium text-fg">{item.title}</div>}
        {item.body && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-soft">{item.body}</p>
        )}
      </button>
    </Card>
  );
}

export function Noticias() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<NewsItem | null>(null);

  const { data, loading, error } = useApi<PostsResponse>(`/posts?page=${page}&limit=${PER_PAGE}`);
  const items = useMemo(() => normalizeNews(data), [data]);
  const totalPages = data?.meta?.totalPages ?? 1;

  const html = useMemo(
    () => (selected?.html ? sanitizeHtml(selected.html) : ""),
    [selected?.html],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-xl font-medium text-fg">Notícias</h1>
        {data?.meta?.totalItems != null && (
          <span className="font-mono text-xs text-fg-muted tabular">
            {data.meta.totalItems} publicações
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {error && (
        <Card className="p-6">
          <p className="text-sm text-red">{error.message}</p>
        </Card>
      )}

      {!loading && !error && items.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-fg-muted">Nenhuma notícia publicada.</p>
        </Card>
      )}

      {items.length > 0 && (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <NewsRow key={item.id} item={item} onOpen={setSelected} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              className="h-8 px-2.5 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={13} aria-hidden />
              Anterior
            </Button>
            <span className="font-mono text-xs text-fg-muted tabular">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              className="h-8 px-2.5 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
              <ChevronRight size={13} aria-hidden />
            </Button>
          </div>
        </>
      )}

      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={selected.title || "Notícia"}
          subtitle={[selected.author, formatDate(selected.date?.toISOString() ?? null)]
            .filter(Boolean)
            .join(" · ")}
        >
          {html ? (
            <div
              className="adalove-prose text-sm leading-relaxed text-fg-soft"
              // Sanitizado: sem script/iframe/handlers inline.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-fg-soft">{selected.body}</p>
          )}
        </Modal>
      )}
    </div>
  );
}
