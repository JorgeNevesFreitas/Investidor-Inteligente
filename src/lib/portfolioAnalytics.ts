import {
  PortfolioCash, PortfolioCashMember, PortfolioMember, PortfolioDailySnapshot, Position,
} from "@/lib/portfolioService";
import { DBCompany } from "@/lib/financialDataService";

// ── Member attribution helpers ─────────────────────────────────────────────────
// (Adapted copies of the equivalent helpers in Portfolio.tsx — duplicated deliberately
// so the existing page is never touched by Portfolio v2 work.)

export function getMemberCashProportions(
  cashEntries: PortfolioCash[],
  cashMemberEntries: PortfolioCashMember[],
  members: PortfolioMember[],
  broker: string,
  currency: string,
): { memberId: string; proportion: number }[] {
  const relevantIds = new Set(
    cashEntries.filter(e => e.broker === broker && e.currency === currency).map(e => e.id)
  );
  const balances = new Map<string, number>(members.map(m => [m.id, 0]));
  for (const cm of cashMemberEntries) {
    if (relevantIds.has(cm.cash_id)) {
      balances.set(cm.member_id, (balances.get(cm.member_id) ?? 0) + cm.amount);
    }
  }
  const total = Array.from(balances.values()).filter(v => v > 0).reduce((s, v) => s + v, 0);
  if (total <= 0) return members.map(m => ({ memberId: m.id, proportion: 1 / members.length }));
  return members.map(m => ({
    memberId: m.id,
    proportion: Math.max(0, balances.get(m.id) ?? 0) / total,
  }));
}

export function getMemberTickerProportions(
  cashEntries: PortfolioCash[],
  cashMemberEntries: PortfolioCashMember[],
  members: PortfolioMember[],
  ticker: string,
): { memberId: string; proportion: number }[] {
  const buyIds = new Set(
    cashEntries.filter(e => e.type === "buy" && e.ticker === ticker).map(e => e.id)
  );
  if (buyIds.size === 0) return members.map(m => ({ memberId: m.id, proportion: 1 / members.length }));
  const memberBuys = new Map<string, number>(members.map(m => [m.id, 0]));
  for (const cm of cashMemberEntries) {
    if (buyIds.has(cm.cash_id)) {
      memberBuys.set(cm.member_id, (memberBuys.get(cm.member_id) ?? 0) + Math.abs(cm.amount));
    }
  }
  const total = Array.from(memberBuys.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return members.map(m => ({ memberId: m.id, proportion: 1 / members.length }));
  return members.map(m => ({
    memberId: m.id,
    proportion: (memberBuys.get(m.id) ?? 0) / total,
  }));
}

// ── XIRR / MWR (money-weighted return) ─────────────────────────────────────────

export interface CashFlow {
  date: string; // ISO date
  amount: number;
}

function daysBetween(d0: string, d1: string): number {
  return (new Date(d1).getTime() - new Date(d0).getTime()) / (1000 * 60 * 60 * 24);
}

function xnpv(rate: number, cashflows: CashFlow[]): number {
  const t0 = cashflows[0].date;
  return cashflows.reduce(
    (sum, cf) => sum + cf.amount / Math.pow(1 + rate, daysBetween(t0, cf.date) / 365),
    0
  );
}

function xnpvDerivative(rate: number, cashflows: CashFlow[]): number {
  const t0 = cashflows[0].date;
  return cashflows.reduce((sum, cf) => {
    const t = daysBetween(t0, cf.date) / 365;
    if (t === 0) return sum;
    return sum - (t * cf.amount) / Math.pow(1 + rate, t + 1);
  }, 0);
}

/** Annualized internal rate of return for a series of dated cash flows (Newton-Raphson, bisection fallback). */
export function computeXIRR(cashflows: CashFlow[]): number | null {
  const sorted = [...cashflows]
    .filter(cf => Number.isFinite(cf.amount) && cf.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const hasPositive = sorted.some(cf => cf.amount > 0);
  const hasNegative = sorted.some(cf => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = xnpv(rate, sorted);
    const df = xnpvDerivative(rate, sorted);
    if (Math.abs(df) < 1e-10) break;
    let newRate = rate - f / df;
    if (!Number.isFinite(newRate)) break;
    if (newRate <= -0.999) newRate = -0.999 + 1e-6;
    if (Math.abs(newRate - rate) < 1e-7) { rate = newRate; break; }
    rate = newRate;
  }

  if (Number.isFinite(rate) && Math.abs(xnpv(rate, sorted)) < 1) return rate;

  // Bisection fallback over a wide, sane range
  let low = -0.9999;
  let high = 10;
  let fLow = xnpv(low, sorted);
  const fHigh = xnpv(high, sorted);
  if (fLow * fHigh > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = xnpv(mid, sorted);
    if (Math.abs(fMid) < 1e-2) return mid;
    if ((fLow < 0) === (fMid < 0)) { low = mid; fLow = fMid; } else { high = mid; }
  }
  return (low + high) / 2;
}

/**
 * Money-weighted return (XIRR) for the whole portfolio, or a single member when `memberId` is given.
 * Deposits are treated as cash leaving the investor's pocket (negative flow); withdrawals and the
 * current total value (as of today) are treated as cash returned to the investor (positive flow).
 */
export function computeMWR(
  cashEntries: PortfolioCash[],
  cashMemberEntries: PortfolioCashMember[],
  currentTotalEur: number,
  eurUsd: number,
  memberId?: string,
): number | null {
  const toEur = (amount: number, currency: string) => (currency === "EUR" ? amount : amount / eurUsd);

  const flows: CashFlow[] = [];
  for (const e of cashEntries) {
    if (e.type !== "deposit" && e.type !== "withdrawal") continue;
    let amountEur: number;
    if (memberId) {
      const cm = cashMemberEntries.find(c => c.cash_id === e.id && c.member_id === memberId);
      if (!cm) continue;
      amountEur = toEur(cm.amount, e.currency);
    } else {
      amountEur = toEur(e.amount, e.currency);
    }
    // portfolio_cash: amount is already signed (positive = entrada, negative = saída),
    // so from the investor's own cash-flow perspective it's simply the negative of that.
    flows.push({ date: e.date, amount: -amountEur });
  }
  if (flows.length === 0) return null;
  flows.push({ date: new Date().toISOString().slice(0, 10), amount: currentTotalEur });
  return computeXIRR(flows);
}

// ── Time-weighted return, volatility, drawdown, Sharpe, Beta ──────────────────
// All derived from the daily portfolio snapshots (accumulating from the day the
// portfolio-snapshot cron started running — no retroactive history).

export interface AlignedReturns {
  dates: string[];
  portfolioReturns: number[];
  benchmarkReturns: number[]; // NaN where the benchmark close is missing for that pair
}

/** Builds same-length, date-aligned daily return series for the portfolio and its benchmark. */
export function computeAlignedReturns(
  snapshots: PortfolioDailySnapshot[],
  cashEntries: PortfolioCash[],
  eurUsd: number,
): AlignedReturns {
  const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  const cfByDate = new Map<string, number>();
  for (const e of cashEntries) {
    if (e.type !== "deposit" && e.type !== "withdrawal") continue;
    const amountEur = e.currency === "EUR" ? e.amount : e.amount / eurUsd;
    cfByDate.set(e.date, (cfByDate.get(e.date) ?? 0) + amountEur);
  }

  const dates: string[] = [];
  const portfolioReturns: number[] = [];
  const benchmarkReturns: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.total_value_eur <= 0) continue;
    const cf = cfByDate.get(curr.snapshot_date) ?? 0;
    const pr = (curr.total_value_eur - cf - prev.total_value_eur) / prev.total_value_eur;

    let br = NaN;
    if (prev.benchmark_close != null && curr.benchmark_close != null && prev.benchmark_close > 0) {
      br = curr.benchmark_close / prev.benchmark_close - 1;
    }

    dates.push(curr.snapshot_date);
    portfolioReturns.push(pr);
    benchmarkReturns.push(br);
  }

  return { dates, portfolioReturns, benchmarkReturns };
}

/** Chains a series of periodic returns into a single cumulative (time-weighted) return. */
export function computeTWR(dailyReturns: number[]): number | null {
  if (dailyReturns.length === 0) return null;
  return dailyReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

export function computeCumulativeIndex(dailyReturns: number[], base = 100): number[] {
  const idx: number[] = [base];
  for (const r of dailyReturns) idx.push(idx[idx.length - 1] * (1 + r));
  return idx;
}

/** Annualized standard deviation of daily returns (sample stdev × √252). */
export function computeVolatility(dailyReturns: number[]): number | null {
  if (dailyReturns.length < 2) return null;
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Maximum peak-to-trough decline (negative number, e.g. -0.15 = -15%) of a value/index series. */
export function computeMaxDrawdown(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0];
  let maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

/** Projects a total return earned over `days` calendar days to an annualized rate. */
export function annualizeReturn(totalReturn: number, days: number): number | null {
  if (days <= 0 || !Number.isFinite(totalReturn)) return null;
  return Math.pow(1 + totalReturn, 365 / days) - 1;
}

const DEFAULT_RISK_FREE_RATE = 0.02;

export function computeSharpe(
  annualReturn: number | null,
  annualVolatility: number | null,
  riskFreeRate: number = DEFAULT_RISK_FREE_RATE,
): number | null {
  if (annualReturn === null || annualVolatility === null || annualVolatility === 0) return null;
  return (annualReturn - riskFreeRate) / annualVolatility;
}

/** Beta of the portfolio vs. its benchmark (covariance / benchmark variance), over paired days. */
export function computeBeta(portfolioReturns: number[], benchmarkReturns: number[]): number | null {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(portfolioReturns[i]) && Number.isFinite(benchmarkReturns[i])) {
      pairs.push([portfolioReturns[i], benchmarkReturns[i]]);
    }
  }
  if (pairs.length < 2) return null;

  const meanP = pairs.reduce((s, [p]) => s + p, 0) / pairs.length;
  const meanB = pairs.reduce((s, [, b]) => s + b, 0) / pairs.length;
  let cov = 0;
  let varB = 0;
  for (const [p, b] of pairs) {
    cov += (p - meanP) * (b - meanB);
    varB += (b - meanB) ** 2;
  }
  if (varB === 0) return null;
  return cov / varB;
}

// ── Sector allocation ───────────────────────────────────────────────────────────

export interface SectorAllocation {
  sector: string;
  valueEur: number;
  pct: number;
}

export function computeSectorAllocation(positions: Position[], companies: DBCompany[]): SectorAllocation[] {
  const sectorByTicker = new Map<string, string>();
  for (const c of companies) sectorByTicker.set(c.ticker.toUpperCase(), c.sector || "Outro");

  const open = positions.filter(p => p.current_qty > 0);
  const totalEur = open.reduce((s, p) => s + p.current_value_eur, 0);

  const map = new Map<string, number>();
  for (const p of open) {
    const sector = sectorByTicker.get(p.ticker.toUpperCase()) || "Outro";
    map.set(sector, (map.get(sector) ?? 0) + p.current_value_eur);
  }

  return Array.from(map.entries())
    .map(([sector, valueEur]) => ({ sector, valueEur, pct: totalEur > 0 ? (valueEur / totalEur) * 100 : 0 }))
    .sort((a, b) => b.valueEur - a.valueEur);
}
