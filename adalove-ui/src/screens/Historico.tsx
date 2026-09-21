import { ArrowLeft } from "lucide-react";
import { useApi } from "~/data/api";
import { cn } from "~/lib/cn";
import { formatDate } from "~/lib/date";
import { gradeColor } from "~/lib/grade";
import { Badge } from "~/ui/Badge";
import { Card } from "~/ui/Card";
import { SkeletonStats, SkeletonTable } from "~/ui/Skeleton";
import { Table, TableContainer, Td, Th } from "~/ui/Table";

// GET /student-curriculums/student-record devolve `{ programs: [...] }`, e é
// daqui que sai o CRA — não existe endpoint separado para ele, então esta tela
// atende os dois itens do menu do Adalove.

interface ModuleInfo {
  grade: string | number | null;
  absence: number | null;
  status?: string | null;
}

interface RecordModule {
  sequence: number | null;
  code: string | null;
  caption: string | null;
  ch: number | null;
  status: string | null;
  startDate: string | null;
  projectName: string | null;
  metaprojectName: string | null;
  regularInfo: ModuleInfo | null;
  recoveryInfo: ModuleInfo | null;
  finalInfo: ModuleInfo | null;
}

interface Program {
  name: string | null;
  programAcronym: string | null;
  cra: number | string | null;
  ch: number | null;
  dateIn: string | null;
  dateOut: string | null;
  modules: RecordModule[];
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function statusTone(status: string | null): "positive" | "negative" | "default" {
  const s = (status ?? "").toUpperCase();
  if (s.startsWith("APROV")) return "positive";
  if (s.startsWith("REPROV")) return "negative";
  return "default";
}

export function Historico({ onBack }: { onBack?: () => void }) {
  const { data, loading, error } = useApi<{ programs: Program[] }>(
    "/student-curriculums/student-record",
  );

  const program = data?.programs?.[0] ?? null;
  const modules = (program?.modules ?? []).filter((m) => m.caption || m.code);
  const done = modules.filter((m) => (m.status ?? "").toUpperCase().startsWith("APROV"));

  const cra = num(program?.cra);

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={13} aria-hidden />
          Acadêmico
        </button>
      )}

      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-xl font-medium text-fg">Histórico escolar</h1>
        {program?.name && <span className="text-xs text-fg-muted">{program.name}</span>}
      </div>

      {loading && (
        <>
          <SkeletonStats count={4} />
          <SkeletonTable rows={10} columns={6} />
        </>
      )}

      {error && (
        <Card className="p-6">
          <p className="text-sm text-red">{error.message}</p>
        </Card>
      )}

      {program && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="px-4 py-3" style={{ borderTop: `2px solid ${gradeColor(cra)}` }}>
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
                CRA
              </div>
              <div
                className="mt-1 font-mono text-2xl font-medium tracking-tight tabular"
                style={{ color: gradeColor(cra) }}
              >
                {cra?.toFixed(2) ?? "—"}
              </div>
              <div className="mt-0.5 text-[0.62rem] text-fg-muted">coeficiente de rendimento</div>
            </Card>
            <Card className="px-4 py-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
                Carga horária
              </div>
              <div className="mt-1 font-mono text-2xl font-medium text-fg tabular">
                {program.ch ?? "—"}
              </div>
              <div className="mt-0.5 text-[0.62rem] text-fg-muted">horas no currículo</div>
            </Card>
            <Card className="px-4 py-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
                Módulos concluídos
              </div>
              <div className="mt-1 font-mono text-2xl font-medium text-fg tabular">
                {done.length}
                <span className="text-base text-fg-muted">/{modules.length}</span>
              </div>
            </Card>
            <Card className="px-4 py-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
                Início
              </div>
              <div className="mt-1 font-mono text-xl font-medium text-fg tabular">
                {formatDate(program.dateIn) ?? "—"}
              </div>
              <div className="mt-0.5 text-[0.62rem] text-fg-muted">
                {program.programAcronym ?? ""}
              </div>
            </Card>
          </div>

          <TableContainer>
            <Table>
              <thead>
                <tr>
                  <Th className="w-14">#</Th>
                  <Th className="w-28">Código</Th>
                  <Th>Módulo</Th>
                  <Th className="w-20 text-right">CH</Th>
                  <Th className="w-20 text-right">Nota</Th>
                  <Th className="w-24 text-right">Frequência</Th>
                  <Th className="w-28">Status</Th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m, i) => {
                  const info = m.finalInfo ?? m.regularInfo;
                  const grade = num(info?.grade);
                  const absence = info?.absence ?? null;
                  return (
                    <tr
                      key={`${m.code ?? i}`}
                      className="transition-colors hover:bg-surface-hover"
                    >
                      <Td className="font-mono text-xs text-fg-muted tabular">
                        {m.sequence ?? i + 1}
                      </Td>
                      <Td className="font-mono text-xs text-fg-muted tabular">{m.code ?? "—"}</Td>
                      <Td className="text-xs">
                        {m.caption ?? "—"}
                        {m.projectName && (
                          <span className="ml-2 text-fg-muted">· {m.projectName}</span>
                        )}
                      </Td>
                      <Td className="text-right font-mono text-xs text-fg-muted tabular">
                        {m.ch ?? "—"}
                      </Td>
                      <Td
                        className="text-right font-mono text-xs font-medium tabular"
                        style={{ color: gradeColor(grade) }}
                      >
                        {grade?.toFixed(2) ?? "—"}
                      </Td>
                      <Td
                        className={cn(
                          "text-right font-mono text-xs tabular",
                          absence != null && absence < 80 ? "text-red" : "text-fg-soft",
                        )}
                      >
                        {absence != null ? `${absence}%` : "—"}
                      </Td>
                      <Td>
                        {m.status ? (
                          <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                        ) : (
                          <span className="text-xs text-fg-muted">em curso</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableContainer>
        </>
      )}
    </div>
  );
}
