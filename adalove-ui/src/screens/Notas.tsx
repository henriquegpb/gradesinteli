import { useMemo, useState } from "react";
import { fmtNota, fmtPeso } from "@/lib/format";
import type { ItemNota } from "@/types/grades";
import { CATEGORY_COLOR } from "~/data/activityTypes";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { cn } from "~/lib/cn";
import { AskAiButtons } from "~/ai/AskAiButton";
import { Badge } from "~/ui/Badge";
import { Card } from "~/ui/Card";
import { Table, TableContainer, Td, Th } from "~/ui/Table";

type SortKey = "atividade" | "semana" | "tipo" | "peso" | "nota";

/** Escala de calor do peso — mesmos limiares do ActivitiesTable do GradesInteli. */
function weightColor(peso: number): string {
  if (peso <= 0.01) return "var(--color-green)";
  if (peso <= 0.02) return "var(--color-yellow)";
  if (peso <= 0.03) return "var(--color-orange)";
  if (peso <= 0.04) return "var(--color-red)";
  if (peso <= 0.05) return "var(--color-peso-critico)";
  return "var(--color-purple)";
}

export function Notas({
  view,
  onOpen,
  showHeader = true,
}: {
  view: SectionView;
  onOpen: (a: ActivityView) => void;
  /** Falso quando embutida numa aba da Visão geral, que já tem título. */
  showHeader?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("semana");
  const [dir, setDir] = useState<1 | -1>(1);

  // A tabela mostra os itens calculados (mesma fonte das métricas); o clique
  // precisa da atividade rica para abrir o modal e montar o prompt de IA.
  const activityByName = useMemo(() => {
    const map = new Map<string, ActivityView>();
    for (const a of view.activities) map.set(a.caption, a);
    return map;
  }, [view.activities]);

  const rows = useMemo(() => {
    const weekNum = (s: string) => Number(/(\d+)/.exec(s)?.[1] ?? 0);
    const compare = (a: ItemNota, b: ItemNota): number => {
      switch (sort) {
        case "atividade":
          return a.atividade.localeCompare(b.atividade);
        case "tipo":
          return a.tipo.localeCompare(b.tipo);
        case "peso":
          return a.peso - b.peso;
        case "nota":
          return (a.nota ?? -1) - (b.nota ?? -1);
        default:
          return weekNum(a.semana) - weekNum(b.semana);
      }
    };
    return [...view.items].sort((a, b) => compare(a, b) * dir);
  }, [view.items, sort, dir]);

  function toggle(key: SortKey) {
    if (key === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(key);
      setDir(1);
    }
  }

  const header = (key: SortKey, label: string, className?: string) => (
    <Th className={cn("cursor-pointer hover:text-fg-soft", className)} onClick={() => toggle(key)}>
      {label}
      {sort === key ? (dir === 1 ? " ↑" : " ↓") : ""}
    </Th>
  );

  if (!view.items.length) {
    return (
      <div className="space-y-4">
        {showHeader && <h1 className="text-xl font-medium text-fg">Notas</h1>}
        <Card className="p-6">
          <p className="text-sm text-fg-muted">Nenhuma atividade avaliada nesta turma ainda.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        {showHeader && <h1 className="text-xl font-medium text-fg">Notas</h1>}
        <span className="font-mono text-xs text-fg-muted">
          {view.items.filter((i) => i.nota !== null).length} de {view.items.length} avaliadas
        </span>
      </div>

      <TableContainer>
        <Table>
          <thead>
            <tr>
              {header("atividade", "Atividade")}
              {header("semana", "Semana", "w-24")}
              {header("tipo", "Tipo", "w-32")}
              {header("peso", "Peso", "w-20 text-right")}
              {header("nota", "Nota", "w-20 text-right")}
              <Th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const activity = activityByName.get(item.atividade);
              return (
                <tr
                  key={item.id}
                  onClick={() => activity && onOpen(activity)}
                  className={cn(
                    "transition-colors hover:bg-surface-hover",
                    activity && "cursor-pointer",
                    item.nota === null && "opacity-60",
                  )}
                >
                  <Td className="text-xs">{item.atividade}</Td>
                  <Td className="font-mono text-xs text-fg-muted tabular">{item.semana}</Td>
                  <Td>
                    <Badge color={CATEGORY_COLOR[item.tipo]}>{item.tipo}</Badge>
                  </Td>
                  <Td
                    className="text-right font-mono text-xs tabular"
                    style={{ color: weightColor(item.peso) }}
                  >
                    {fmtPeso(item.peso)}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular">{fmtNota(item.nota)}</Td>
                  <Td className="text-right">
                    {activity && (
                      <div
                        className="flex justify-end"
                        onClick={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <AskAiButtons activity={activity} view={view} size="sm" />
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableContainer>
    </div>
  );
}
