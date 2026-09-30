import { Briefcase, CalendarClock, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { normalize } from "@/lib/normalize";
import { useApi } from "~/data/api";
import { formatDate } from "~/lib/date";
import { Badge } from "~/ui/Badge";
import { Card, CardTitle } from "~/ui/Card";
import { SearchInput } from "~/ui/Input";
import { SkeletonGrid } from "~/ui/Skeleton";

interface Company {
  uuid: string;
  name: string | null;
  salary: string | number | null;
  email: string | null;
  internship_start_date: string | null;
  internship_end_date: string | null;
  registration_start_date: string | null;
  registration_end_date: string | null;
}

function money(value: string | number | null): string | null {
  if (value == null) return null;
  const n = Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
  if (Number.isNaN(n) || n === 0) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Inscrição aberta quando hoje está dentro da janela de registro. */
function isOpen(company: Company, now = Date.now()): boolean {
  const start = company.registration_start_date
    ? new Date(company.registration_start_date).getTime()
    : null;
  const end = company.registration_end_date
    ? new Date(company.registration_end_date).getTime()
    : null;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return !!(start || end);
}

function CompanyCard({ company }: { company: Company }) {
  const salary = money(company.salary);
  const open = isOpen(company);

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-2">
        <Briefcase size={14} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-sm leading-snug text-fg">{company.name ?? "—"}</span>
        <Badge tone={open ? "positive" : "default"}>{open ? "Aberta" : "Fechada"}</Badge>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-fg-soft">
        {salary && (
          <div>
            Bolsa <span className="font-mono text-fg tabular">{salary}</span>
          </div>
        )}
        {(company.registration_start_date || company.registration_end_date) && (
          <div className="inline-flex items-center gap-1.5">
            <CalendarClock size={12} aria-hidden className="text-fg-muted" />
            <span className="font-mono tabular">
              {formatDate(company.registration_start_date) ?? "?"} →{" "}
              {formatDate(company.registration_end_date) ?? "?"}
            </span>
          </div>
        )}
        {(company.internship_start_date || company.internship_end_date) && (
          <div className="text-fg-muted">
            Estágio: {formatDate(company.internship_start_date) ?? "?"} →{" "}
            {formatDate(company.internship_end_date) ?? "?"}
          </div>
        )}
      </div>

      {company.email && (
        <a
          href={`mailto:${company.email}`}
          className="mt-auto inline-flex items-center gap-1.5 pt-3 text-xs text-accent hover:underline"
        >
          <Mail size={12} aria-hidden />
          {company.email}
        </a>
      )}
    </Card>
  );
}

export function Carreiras() {
  const [query, setQuery] = useState("");
  const { data, loading, error } = useApi<{
    myRegistrations: Company[];
    registrationsAvailable: Company[];
  }>("/internship-companies");

  const mine = data?.myRegistrations ?? [];
  const available = useMemo(() => {
    const q = normalize(query.trim());
    const list = data?.registrationsAvailable ?? [];
    return q ? list.filter((c) => normalize(c.name ?? "").includes(q)) : list;
  }, [data?.registrationsAvailable, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-xl font-medium text-fg">Carreiras</h1>
        <span className="font-mono text-xs text-fg-muted tabular">
          {data?.registrationsAvailable.length ?? 0} empresas
        </span>
      </div>

      {loading && <SkeletonGrid count={6} columns={3} lines={2} />}

      {error && (
        <Card className="p-6">
          <p className="text-sm text-red">{error.message}</p>
        </Card>
      )}

      {mine.length > 0 && (
        <div className="space-y-3">
          <CardTitle>Minhas inscrições</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((c) => (
              <CompanyCard key={c.uuid} company={c} />
            ))}
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          <SearchInput
            className="sm:max-w-sm"
            placeholder="Buscar empresa"
            aria-label="Buscar empresa"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {available.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((c) => (
                <CompanyCard key={c.uuid} company={c} />
              ))}
            </div>
          ) : (
            <Card className="p-6">
              <p className="text-sm text-fg-muted">
                {query ? "Nenhuma empresa com esse nome." : "Nenhuma vaga disponível."}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
