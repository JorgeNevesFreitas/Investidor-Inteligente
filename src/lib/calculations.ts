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
  
  // Build projected cash flows array (years 1-10 + terminal)
  const cashFlows: number[] = [];
  let cf = baseCashFlow;
  for (let i = 1; i <= 5; i++) {
    cf = cf * (1 + growthRate1to5 / 100);
    cashFlows.push(cf);
  }
  for (let i = 6; i <= 10; i++) {
    cf = cf * (1 + growthRate6to10 / 100);
    cashFlows.push(cf);
  }
  const terminalValue = cf * terminalMultiple;

  // Calculate intrinsic value using discount rate
  let totalPV = 0;
  for (let i = 0; i < 10; i++) {
    totalPV += cashFlows[i] / Math.pow(1 + discountRate / 100, i + 1);
  }
  const pvTerminal = terminalValue / Math.pow(1 + discountRate / 100, 10);

  const intrinsicValueTotal = totalPV + pvTerminal;
  const intrinsicValuePerShare = intrinsicValueTotal / sharesOutstanding;
  const intrinsicWithMargin = intrinsicValuePerShare * (1 - marginOfSafety / 100);
  const upside = ((intrinsicValuePerShare - currentPrice) / currentPrice) * 100;

  // IRR: find rate r where PV(cashFlows, TV, r) = currentPrice * sharesOutstanding
  const marketCap = currentPrice * sharesOutstanding;
  const calcPV = (r: number) => {
    let pv = 0;
    for (let i = 0; i < 10; i++) {
      pv += cashFlows[i] / Math.pow(1 + r, i + 1);
    }
    pv += terminalValue / Math.pow(1 + r, 10);
    return pv;
  };

  // Bisection method
  let lo = -0.5, hi = 2.0;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    if (calcPV(mid) > marketCap) lo = mid;
    else hi = mid;
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
