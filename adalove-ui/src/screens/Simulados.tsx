import { BookMarked, CalendarClock } from "lucide-react";
import { useApi } from "~/data/api";
import { Badge } from "~/ui/Badge";
import { Card } from "~/ui/Card";
import { SkeletonList } from "~/ui/Skeleton";

interface MockTest {
  uuid: string;
  title: string | null;
  active: boolean | number | null;
  contact_information: string | null;
  testStartDateInBr: string | null;
  testEndDateInBr: string | null;
  registrationStartDateInBr: string | null;
  registrationEndDateInBr: string | null;
  registrationIsExpired: boolean | null;
  testIsExpired: boolean | null;
  userApplication: { uuid?: string | null } | null;
}

function Window({
  label,
  start,
  end,
  expired,
}: {
  label: string;
  start: string | null;
  end: string | null;
  expired: boolean | null;
}) {
  if (!start && !end) return null;
  return (
    <div className="min-w-0">
      <div className="text-[0.58rem] uppercase tracking-[0.06em] text-fg-muted">{label}</div>
      <div className="mt-1 inline-flex items-center gap-1.5">
        <CalendarClock size={12} aria-hidden className="text-fg-muted" />
        <span className="font-mono text-xs text-fg tabular">
          {start ?? "?"} → {end ?? "?"}
        </span>
        {expired && <Badge>encerrado</Badge>}
      </div>
    </div>
  );
}

export function Simulados() {
  const { data, loading, error } = useApi<MockTest[]>("/admission-processes/mock-tests");
  const tests = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-fg">Simulados</h1>

      {loading && <SkeletonList rows={2} />}

      {error && (
        <Card className="p-6">
          <p className="text-sm text-red">{error.message}</p>
        </Card>
      )}

      {!loading && !error && tests.length === 0 && (
        <Card className="flex items-center gap-2 p-6">
          <BookMarked size={15} aria-hidden className="text-fg-muted" />
          <p className="text-sm text-fg-muted">Nenhum simulado disponível.</p>
        </Card>
      )}

      <div className="space-y-3">
        {tests.map((test) => (
          <Card key={test.uuid} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <BookMarked size={15} aria-hidden className="text-purple" />
              <span className="text-sm font-medium text-fg">{test.title ?? "Simulado"}</span>
              {test.userApplication?.uuid && <Badge tone="positive">Inscrito</Badge>}
              {test.testIsExpired && <Badge>Encerrado</Badge>}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Window
                label="Inscrições"
                start={test.registrationStartDateInBr}
                end={test.registrationEndDateInBr}
                expired={test.registrationIsExpired}
              />
              <Window
                label="Prova"
                start={test.testStartDateInBr}
                end={test.testEndDateInBr}
                expired={test.testIsExpired}
              />
            </div>

            {test.contact_information && (
              <p className="mt-4 border-t border-line-soft pt-3 text-xs text-fg-muted">
                {test.contact_information}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
