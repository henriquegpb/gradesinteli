import { ExternalLink, Globe2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useApi } from "~/data/api";
import { formatDate } from "~/lib/date";
import { normalize } from "@/lib/normalize";
import { Badge } from "~/ui/Badge";
import { Card, CardTitle } from "~/ui/Card";
import { SearchInput } from "~/ui/Input";
import { Select } from "~/ui/Select";
import { SkeletonGrid, SkeletonList } from "~/ui/Skeleton";

interface Notice {
  uuid: string;
  title: string | null;
  type: string | null;
  start_date: string | null;
  end_date: string | null;
  criteria: string | null;
  description: string | null;
  application_status: string | null;
  is_closed: boolean | number | null;
}

interface Agreement {
  uuid: string;
  name: string | null;
  country: string | null;
  type: string | null;
  website: string | null;
}

export function Intercambio() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");

  const notices = useApi<Notice[]>("/exchange-program-notices");
  const agreements = useApi<Agreement[]>("/exchange-program-agreements");

  const all = useMemo(() => agreements.data ?? [], [agreements.data]);
  const countries = useMemo(
    () => [...new Set(all.map((a) => a.country).filter((c): c is string => !!c))].sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return all.filter((a) => {
      if (country !== "all" && a.country !== country) return false;
      if (q && !normalize(a.name ?? "").includes(q) && !normalize(a.country ?? "").includes(q))
        return false;
      return true;
    });
  }, [all, query, country]);

  const loading = notices.loading || agreements.loading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-xl font-medium text-fg">Intercâmbio</h1>
        <span className="font-mono text-xs text-fg-muted tabular">
          {all.length} universidades em {countries.length} países
        </span>
      </div>

      {loading && (
        <>
          <SkeletonList rows={2} />
          <SkeletonGrid count={6} columns={3} lines={2} />
        </>
      )}

      {!loading && (notices.data?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <CardTitle>Editais</CardTitle>
          {notices.data!.map((n) => {
            const closed = n.is_closed === true || n.is_closed === 1;
            return (
              <Card key={n.uuid} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg">{n.title ?? "Edital"}</span>
                  <Badge tone={closed ? "default" : "positive"}>
                    {closed ? "Encerrado" : "Aberto"}
                  </Badge>
                  {n.type && <Badge>{n.type}</Badge>}
                  {n.application_status && <Badge tone="info">{n.application_status}</Badge>}
                </div>
                {(n.start_date || n.end_date) && (
                  <div className="mt-1 font-mono text-xs text-fg-muted tabular">
                    {formatDate(n.start_date) ?? "?"} → {formatDate(n.end_date) ?? "?"}
                  </div>
                )}
                {n.description && (
                  <p className="mt-2 text-xs leading-relaxed text-fg-soft">{n.description}</p>
                )}
                {n.criteria && (
                  <p className="mt-2 text-xs leading-relaxed text-fg-muted">{n.criteria}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!loading && all.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SearchInput
              placeholder="Buscar universidade ou país"
              aria-label="Buscar universidade"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select aria-label="País" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="all">Todos os países</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => {
              const inner = (
                <>
                  <div className="flex items-start gap-2">
                    <Globe2 size={14} aria-hidden className="mt-0.5 shrink-0 text-teal" />
                    <span className="min-w-0 flex-1 text-sm leading-snug text-fg">{a.name}</span>
                    {a.website && (
                      <ExternalLink size={12} aria-hidden className="mt-1 shrink-0 text-fg-muted" />
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {a.country && <Badge>{a.country}</Badge>}
                    {a.type && <Badge tone="info">{a.type}</Badge>}
                  </div>
                </>
              );

              return a.website ? (
                <a
                  key={a.uuid}
                  href={a.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-card border border-line bg-surface p-4 transition-colors duration-150 hover:border-accent"
                >
                  {inner}
                </a>
              ) : (
                <Card key={a.uuid} className="p-4">
                  {inner}
                </Card>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <Card className="p-6">
              <p className="text-sm text-fg-muted">Nenhuma universidade com esses filtros.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
