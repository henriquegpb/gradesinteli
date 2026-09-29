import { useState } from "react";
import { attendanceUnits } from "@/lib/attendance-parser";
import type { PresencaStatus } from "@/types/grades";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { formatDate } from "~/lib/date";
import { AttendanceModal } from "~/screens/AttendanceDetail";
import { Card, CardTitle } from "~/ui/Card";
import { Table, TableContainer, Td, Th } from "~/ui/Table";

const STATUS_STYLE: Record<PresencaStatus, { label: string; color: string }> = {
  presente: { label: "Presente", color: "var(--color-presente)" },
  justificado: { label: "Justificado", color: "var(--color-justificado)" },
  falta: { label: "Falta", color: "var(--color-falta)" },
  futuro: { label: "—", color: "var(--color-futuro)" },
};

function Dot({ status }: { status: PresencaStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      title={s.label}
      aria-label={s.label}
      className="inline-block size-2.5 rounded-full"
      style={{
        background: status === "futuro" ? "transparent" : s.color,
        border: status === "futuro" ? `1px solid ${s.color}` : undefined,
      }}
    />
  );
}

export function Faltas({
  view,
  showHeader = true,
}: {
  view: SectionView;
  /** Falso quando embutida numa aba da Visão geral, que já tem título. */
  showHeader?: boolean;
}) {
  const a = view.attendance;

  // O modal de presença é assunto desta tela, então o estado mora aqui — o App
  // não precisa saber que a tabela abre alguma coisa.
  const [detail, setDetail] = useState<ActivityView | null>(null);

  // A tabela sai das atividades e não de `attendanceRows` porque a linha precisa
  // carregar o encontro inteiro para abrir o modal. O conjunto é o mesmo: só
  // encontro tem chamada, e o resumo acima continua vindo de `attendanceRows`.
  const encontros = view.activities.filter((x) => x.attendance.length > 0);

  if (!a) {
    return (
      <div className="space-y-4">
        {showHeader && <h1 className="text-xl font-medium text-fg">Faltas</h1>}
        <Card className="p-6">
          <p className="text-sm text-fg-muted">Sem dados de presença nesta turma.</p>
        </Card>
      </div>
    );
  }

  const danger = a.percentFaltas >= 20;
  const warn = a.percentFaltas >= 15;
  const accent = danger ? "var(--color-red)" : warn ? "var(--color-yellow)" : "var(--color-green)";

  // Os totais são em horas-aula (a conta do Adalove). Numa turma de peso único
  // `u` devolve chamadas; com pesos diferentes fica em horas e quem explica o
  // saldo é o card "por peso de aula" abaixo.
  const u = attendanceUnits(a);

  return (
    <div className="space-y-4">
      {showHeader && <h1 className="text-xl font-medium text-fg">Faltas</h1>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-4 py-3" style={{ borderTop: `2px solid ${accent}` }}>
          <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
            Percentual de faltas
          </div>
          <div className="mt-1 font-mono text-xl font-medium text-fg tabular">
            {a.percentFaltas.toFixed(2)}%
          </div>
          <div className="mt-0.5 text-[0.62rem] text-fg-muted">limite de 20%</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
            Faltas restantes
          </div>
          <div className="mt-1 font-mono text-xl font-medium text-fg tabular">
            {u.fmt(a.faltasRestantes)}
          </div>
          <div className="mt-0.5 text-[0.62rem] text-fg-muted">
            de {u.fmt(a.maxFaltasAllowed)} permitidas
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
            Faltas registradas
          </div>
          <div className="mt-1 font-mono text-xl font-medium text-fg tabular">
            {u.fmt(a.faltas)}
          </div>
          <div className="mt-0.5 text-[0.62rem] text-fg-muted">
            {u.fmt(a.justificados)} justificadas
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
            Total de {u.unidade}
          </div>
          <div className="mt-1 font-mono text-xl font-medium text-fg tabular">
            {u.fmt(a.totalUnits)}
          </div>
          <div className="mt-0.5 text-[0.62rem] text-fg-muted">
            {u.peso
              ? `${u.peso}h de aula por chamada`
              : a.pesosAutomaticos
                ? "pesos do Adalove, em horas-aula"
                : "peso 1 por chamada"}
          </div>
        </Card>
      </div>

      {a.faltasRestantesPorPeso?.length ? (
        <Card className="p-4">
          <CardTitle>Faltas restantes por peso de aula</CardTitle>
          <ul className="mt-2 flex flex-wrap gap-4">
            {a.faltasRestantesPorPeso.map((row) => (
              <li key={row.peso} className="text-sm text-fg-soft">
                <span className="font-mono text-fg tabular">{row.slots}</span> aula(s) de peso{" "}
                <span className="font-mono tabular">{row.peso}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 text-xs text-fg-soft">
        {(Object.keys(STATUS_STYLE) as PresencaStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <Dot status={s} />
            {s === "futuro" ? "A ocorrer" : STATUS_STYLE[s].label}
          </span>
        ))}
      </div>

      <TableContainer>
        <Table>
          <thead>
            <tr>
              <Th>Atividade</Th>
              <Th className="w-24">Semana</Th>
              <Th className="w-20">Dia</Th>
              <Th className="w-32">Chamadas</Th>
            </tr>
          </thead>
          <tbody>
            {encontros.map((activity) => {
              const hasFalta = activity.attendance.some((s) => s.status === "falta");
              return (
                <tr
                  key={activity.id}
                  // Linha clicável abre o encontro: é onde estão o horário de cada
                  // chamada e o motivo de um abono, que não cabem na tabela.
                  onClick={() => setDetail(activity)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setDetail(activity);
                  }}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-surface-hover",
                    hasFalta && "bg-red/5",
                    "focus-visible:bg-surface-hover focus-visible:outline-none",
                  )}
                >
                  <Td className="text-xs">{activity.caption}</Td>
                  <Td className="font-mono text-xs text-fg-muted tabular">{activity.week}</Td>
                  <Td className="font-mono text-xs text-fg-muted tabular">
                    {formatDate(activity.date) ?? "—"}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      {activity.attendance.map((slot) => (
                        <Dot key={slot.slot} status={slot.status} />
                      ))}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableContainer>

      <AttendanceModal activity={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
