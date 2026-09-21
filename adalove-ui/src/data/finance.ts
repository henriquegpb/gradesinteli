import { useApi } from "~/data/api";

// Boletos do BTG, o endpoint que a tela de Financeiro consome — aqui porque a
// Sidebar também precisa saber se há boleto em aberto, e o valor formatado sai
// do mesmo lugar nas duas.

export interface BankSlip {
  reference: string | null;
  digitableLine: string | null;
  bankSlipId: string | number | null;
  dueDate: string | null;
  dueDateBR: string | null;
  referenceNumber: string | number | null;
  amount: string | number | null;
}

export const BANK_SLIPS_PATH = "/students/btgpactual/bank-slips";

/** O valor chega como TEXTO, e em dois formatos diferentes conforme o endpoint:
 *  o boleto do BTG vem em pt-BR (`"7.757,78"` — ponto de milhar, vírgula
 *  decimal) e a nota fiscal vem como número de máquina (`"7757.78"`).
 *
 *  Um `Number()` direto no primeiro dá NaN, e era isso que zerava o cartão "Em
 *  aberto": mensalidade passa de mil, então TODO boleto em aberto entrava na
 *  soma como 0 e o total ficava em R$ 0,00 com fatura aberta na tela. Na célula
 *  da tabela o mesmo NaN aparecia mais discreto — o valor saía sem o "R$".
 *
 *  A vírgula é o que desempata: existindo, ela é o separador decimal e os pontos
 *  são de milhar. Sem vírgula, um grupo final de exatamente três dígitos depois
 *  do ponto também é milhar (`"7.757"`), porque centavo tem dois; fora isso o
 *  ponto é decimal. */
export function parseAmount(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  // Fora "R$", espaço e o espaço-fino que formatador de moeda costuma inserir.
  const raw = value.replace(/[^\d,.-]/g, "");
  if (!raw) return null;

  const brDecimal = raw.includes(",") || /\.\d{3}(?:\D|$)/.test(raw);
  const n = Number(brDecimal ? raw.replace(/\./g, "").replace(",", ".") : raw);
  return Number.isNaN(n) ? null : n;
}

export function money(value: string | number | null | undefined): string {
  const n = parseAmount(value);
  if (n !== null) return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Formato que não reconhecemos: o texto cru diz mais do que um "—", que a
  // tabela usa para dizer "não veio valor".
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || "—";
}

/** Boletos em aberto, para o aviso da Sidebar.
 *
 *  Busca própria, no padrão do sino de notificações: cada componente pede o que
 *  precisa. Com a tela de Financeiro aberta a mesma rota é pedida duas vezes —
 *  é uma lista de algumas dezenas de linhas, e o preço de carregar o estado de
 *  duas telas por um provider que só isto usaria seria maior. */
export function usePendingSlips(): BankSlip[] {
  const { data } = useApi<{ pendingSlips: BankSlip[] }>(BANK_SLIPS_PATH);
  return data?.pendingSlips ?? [];
}
