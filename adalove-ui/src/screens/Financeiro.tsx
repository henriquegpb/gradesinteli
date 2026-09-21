import { ArrowLeft, Check, Copy, Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { useApi } from "~/data/api";
import { downloadBankSlip } from "~/data/client";
import { BANK_SLIPS_PATH, money, parseAmount, type BankSlip } from "~/data/finance";
import { formatDate } from "~/lib/date";
import { copyText } from "~/lib/prefs";
import { Badge } from "~/ui/Badge";
import { Card } from "~/ui/Card";
import { Skeleton, SkeletonList, SkeletonStats } from "~/ui/Skeleton";
import { Table, TableContainer, Td, Th } from "~/ui/Table";
import { Tabs } from "~/ui/Tabs";
import { useToast } from "~/ui/Toast";

interface Invoice {
  invoice_id: string | number | null;
  nfse_number: string | number | null;
  emission_date: string | null;
  service_amount: string | number | null;
  service_details: string | null;
  invoice_url: string | null;
}

function CopyLine({ line }: { line: string | null }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  if (!line) return <span className="text-fg-muted">—</span>;

  return (
    <button
      type="button"
      title="Copiar linha digitável"
      onClick={async () => {
        if (await copyText(line)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          toast.error("Não consegui copiar.");
        }
      }}
      className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-fg-soft transition-colors hover:text-accent"
    >
      {copied ? (
        <Check size={12} aria-hidden className="text-green" />
      ) : (
        <Copy size={12} aria-hidden />
      )}
      <span className="tabular">{line.slice(0, 18)}…</span>
    </button>
  );
}

/** Só faz sentido no boleto em aberto: pago não se paga de novo. */
function DownloadSlip({ slip }: { slip: BankSlip }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (slip.bankSlipId == null) return null;

  return (
    <button
      type="button"
      disabled={busy}
      title="Baixar boleto em PDF"
      aria-label="Baixar boleto em PDF"
      onClick={async () => {
        setBusy(true);
        try {
          await downloadBankSlip(slip.bankSlipId!, `boleto-${slip.reference ?? slip.bankSlipId}`);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Não consegui baixar o boleto.",
          );
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-[0.68rem] font-medium text-fg transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {busy ? (
        <Loader2 size={12} aria-hidden className="animate-spin" />
      ) : (
        <Download size={12} aria-hidden />
      )}
      Boleto
    </button>
  );
}

function SlipsTable({ slips, paid }: { slips: BankSlip[]; paid: boolean }) {
  if (!slips.length) {
    return (
      <Card className="p-6">
        <p className="text-sm text-fg-muted">
          {paid ? "Nenhum boleto pago." : "Nenhum boleto em aberto. 🎉"}
        </p>
      </Card>
    );
  }

  return (
    <TableContainer>
      <Table>
        <thead>
          <tr>
            <Th>Referência</Th>
            <Th className="w-32">Vencimento</Th>
            <Th className="w-32 text-right">Valor</Th>
            <Th className="w-24">Status</Th>
            <Th className="w-40">Linha digitável</Th>
            {!paid && <Th className="w-24" />}
          </tr>
        </thead>
        <tbody>
          {slips.map((slip, i) => (
            <tr
              key={`${slip.bankSlipId ?? i}`}
              className="transition-colors hover:bg-surface-hover"
            >
              <Td className="text-xs">{slip.reference ?? "—"}</Td>
              <Td className="font-mono text-xs text-fg-muted tabular">
                {slip.dueDateBR ?? formatDate(slip.dueDate) ?? "—"}
              </Td>
              <Td className="text-right font-mono text-xs tabular">{money(slip.amount)}</Td>
              <Td>
                <Badge tone={paid ? "positive" : "warning"}>{paid ? "Pago" : "Em aberto"}</Badge>
              </Td>
              <Td>
                <CopyLine line={slip.digitableLine} />
              </Td>
              {!paid && (
                <Td className="text-right">
                  <DownloadSlip slip={slip} />
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </TableContainer>
  );
}

function InvoicesTable({ invoices }: { invoices: Invoice[] }) {
  if (!invoices.length) {
    return (
      <Card className="p-6">
        <p className="text-sm text-fg-muted">Nenhuma nota fiscal emitida.</p>
      </Card>
    );
  }

  return (
    <TableContainer>
      <Table>
        <thead>
          <tr>
            <Th className="w-28">Nº NFS-e</Th>
            <Th className="w-32">Emissão</Th>
            <Th>Serviço</Th>
            <Th className="w-32 text-right">Valor</Th>
            <Th className="w-20" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice, i) => (
            <tr
              key={`${invoice.invoice_id ?? i}`}
              className="transition-colors hover:bg-surface-hover"
            >
              <Td className="font-mono text-xs tabular">{invoice.nfse_number ?? "—"}</Td>
              <Td className="font-mono text-xs text-fg-muted tabular">
                {formatDate(invoice.emission_date) ?? "—"}
              </Td>
              <Td className="truncate text-xs">{invoice.service_details ?? "—"}</Td>
              <Td className="text-right font-mono text-xs tabular">
                {money(invoice.service_amount)}
              </Td>
              <Td className="text-right">
                {invoice.invoice_url && (
                  <a
                    href={invoice.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir nota fiscal"
                    className="inline-flex size-7 items-center justify-center rounded-control border border-line text-fg-soft transition-colors hover:border-accent hover:text-accent"
                  >
                    <FileText size={13} aria-hidden />
                  </a>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableContainer>
  );
}

type Tab = "abertos" | "pagos" | "notas";

export function Financeiro({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = useState<Tab>("abertos");
  const slips = useApi<{ pendingSlips: BankSlip[]; paidSlips: BankSlip[] }>(BANK_SLIPS_PATH);
  const invoices = useApi<{ invoices: Invoice[] }>("/students/invoices");

  const pending = slips.data?.pendingSlips ?? [];
  const paid = slips.data?.paidSlips ?? [];
  const loading = slips.loading || invoices.loading;
  const error = slips.error ?? invoices.error;

  const pendingTotal = pending.reduce((sum, s) => sum + (parseAmount(s.amount) ?? 0), 0);

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

      <h1 className="text-xl font-medium text-fg">Financeiro</h1>

      {loading && (
        <>
          <SkeletonStats count={3} />
          <Skeleton className="h-9 w-80" />
          <SkeletonList rows={3} />
        </>
      )}

      {error && (
        <Card className="p-6">
          <p className="text-sm text-red">{error.message}</p>
        </Card>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card
              className="px-4 py-3"
              style={{
                borderTop: `2px solid ${pending.length ? "var(--color-orange)" : "var(--color-green)"}`,
              }}
            >
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
                Em aberto
              </div>
              <div className="mt-1 font-mono text-xl font-medium text-fg tabular">
                {money(pendingTotal)}
              </div>
              <div className="mt-0.5 text-[0.62rem] text-fg-muted">
                {pending.length} boleto{pending.length === 1 ? "" : "s"}
              </div>
            </Card>
            <Card className="px-4 py-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
                Boletos pagos
              </div>
              <div className="mt-1 font-mono text-xl font-medium text-fg tabular">{paid.length}</div>
            </Card>
            <Card className="px-4 py-3">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.04em] text-fg-muted">
                Notas fiscais
              </div>
              <div className="mt-1 font-mono text-xl font-medium text-fg tabular">
                {invoices.data?.invoices.length ?? 0}
              </div>
            </Card>
          </div>

          <Tabs
            options={[
              { label: `Em aberto (${pending.length})`, value: "abertos" },
              { label: `Pagos (${paid.length})`, value: "pagos" },
              { label: `Notas fiscais (${invoices.data?.invoices.length ?? 0})`, value: "notas" },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "abertos" && <SlipsTable slips={pending} paid={false} />}
          {tab === "pagos" && <SlipsTable slips={paid} paid />}
          {tab === "notas" && <InvoicesTable invoices={invoices.data?.invoices ?? []} />}
        </>
      )}
    </div>
  );
}
