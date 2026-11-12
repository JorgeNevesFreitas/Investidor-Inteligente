import { PortfolioCash } from "@/lib/portfolioService";

// Manual FX adjustment ("Ajuste cambial") helpers. The app doesn't store the EUR/USD rate of
// each purchase, so the FX effect on capital converted to USD is recorded as signed
// 'fx_adjustment' portfolio_cash rows, computed here to reconcile with the broker.

export type FxAdjustmentMode = "portfolio_total" | "fx_effect" | "cash_balance" | "direct";

export const FX_ADJUSTMENT_MODE_LABELS: Record<FxAdjustmentMode, string> = {
  portfolio_total: "Valor total da carteira no broker",
  fx_effect: "Efeito câmbio indicado pelo broker",
  cash_balance: "Saldo de caixa no broker",
  direct: "Valor do ajuste",
};

export const FX_ADJUSTMENT_DEFAULT_NOTE = "Ajuste cambial para conciliar com o broker";

/** Parses a user-typed number, accepting a comma as decimal separator. NaN when empty/invalid. */
export function parseSignedNumber(raw: string): number {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === "+") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Sum of portfolio_cash amounts for one broker + currency (in that currency). */
export function cashBalanceFor(cashEntries: PortfolioCash[], broker: string, currency: "EUR" | "USD"): number {
  return cashEntries
    .filter(e => e.broker === broker && e.currency === currency)
    .reduce((s, e) => s + e.amount, 0);
}

export interface FxAdjustmentInput {
  mode: FxAdjustmentMode;
  /** Value typed by the user (broker total / broker FX effect / real balance / direct adjustment). */
  value: number;
  totalPortfolioEur: number;
  fxAdjustmentsEur: number;
  /** App cash balance for the selected broker + currency (only used by "cash_balance"). */
  appCashBalance: number;
}

/** Signed adjustment to record, in the mode's currency. NaN when the input is invalid. */
export function computeFxAdjustment({ mode, value, totalPortfolioEur, fxAdjustmentsEur, appCashBalance }: FxAdjustmentInput): number {
  if (!Number.isFinite(value)) return NaN;
  switch (mode) {
    case "portfolio_total": return value - totalPortfolioEur;
    case "fx_effect": return value - fxAdjustmentsEur;
    case "cash_balance": return value - appCashBalance;
    case "direct": return value;
  }
}

/** Modes 1 and 2 are always in EUR; the others use the selected currency. */
export function fxAdjustmentCurrency(mode: FxAdjustmentMode, selected: "EUR" | "USD"): "EUR" | "USD" {
  return mode === "portfolio_total" || mode === "fx_effect" ? "EUR" : selected;
}

export interface FxMemberSplit {
  member_id: string;
  pct: number;
  amount: number;
  percentage: number;
}

/**
 * Splits a signed adjustment across members by their deposit weights (pct in 0..1).
 * Falls back to an equal split when no weights are available or they sum to 0.
 */
export function splitFxAdjustment(
  adjustment: number,
  memberIds: string[],
  weights: { member_id: string; pct: number }[],
): FxMemberSplit[] {
  if (memberIds.length === 0) return [];
  const byId = new Map(weights.map(w => [w.member_id, w.pct]));
  const sum = memberIds.reduce((s, id) => s + Math.max(0, byId.get(id) ?? 0), 0);
  return memberIds.map(id => {
    const pct = sum > 0 ? Math.max(0, byId.get(id) ?? 0) / sum : 1 / memberIds.length;
    return {
      member_id: id,
      pct,
      amount: parseFloat((adjustment * pct).toFixed(4)),
      percentage: parseFloat((pct * 100).toFixed(2)),
    };
  });
}
