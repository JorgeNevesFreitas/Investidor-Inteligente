export interface DCFInputs {
  method: "fcf" | "eps";
  discountRate: number;
  growthRate1to5: number;
  growthRate6to10: number;
  terminalMultiple: number;
  marginOfSafety: number;
}

export interface DCFResult {
  intrinsicValueTotal: number;
  intrinsicValuePerShare: number;
  intrinsicWithMargin: number;
  currentPrice: number;
  upside: number;
  irr: number;
  status: "invest" | "watch" | "wait";
}

export function calculateDCF(
  baseCashFlow: number,
  sharesOutstanding: number,
  currentPrice: number,
  inputs: DCFInputs
): DCFResult {
  const { discountRate, growthRate1to5, growthRate6to10, terminalMultiple, marginOfSafety } = inputs;

  // Helper: compute NPV of projected CFs at a given rate
  function computeNPV(rate: number): number {
    let total = 0;
    let cf = baseCashFlow;
    for (let i = 1; i <= 5; i++) {
      cf = cf * (1 + growthRate1to5 / 100);
      total += cf / Math.pow(1 + rate, i);
    }
    for (let i = 6; i <= 10; i++) {
      cf = cf * (1 + growthRate6to10 / 100);
      total += cf / Math.pow(1 + rate, i);
    }
    total += (cf * terminalMultiple) / Math.pow(1 + rate, 10);
    return total;
  }

  const intrinsicValueTotal = computeNPV(discountRate / 100);
  const intrinsicValuePerShare = intrinsicValueTotal / sharesOutstanding;
  const intrinsicWithMargin = intrinsicValuePerShare * (1 - marginOfSafety / 100);
  const upside = ((intrinsicValuePerShare - currentPrice) / currentPrice) * 100;

  // IRR: find rate r where NPV(r) = currentPrice * sharesOutstanding
  const targetNPV = currentPrice * sharesOutstanding;
  let lo = -0.5, hi = 2.0;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    if (computeNPV(mid) > targetNPV) lo = mid; else hi = mid;
  }
  const irr = ((lo + hi) / 2) * 100;

  let status: DCFResult["status"] = "wait";
  if (currentPrice <= intrinsicWithMargin) status = "invest";
  else if (currentPrice <= intrinsicValuePerShare) status = "watch";

  return {
    intrinsicValueTotal,
    intrinsicValuePerShare,
    intrinsicWithMargin,
    currentPrice,
    upside,
    irr,
    status,
  };
}

export function formatNumber(n: number, decimals = 0): string {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "T";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "B";
  return n.toFixed(decimals);
}

export function formatCurrency(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function formatPercent(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1) + "%";
}

export function getChangeColor(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-muted-foreground";
}
