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
  
  let totalPV = 0;
  let cf = baseCashFlow;

  // Years 1-5
  for (let i = 1; i <= 5; i++) {
    cf = cf * (1 + growthRate1to5 / 100);
    totalPV += cf / Math.pow(1 + discountRate / 100, i);
  }

  // Years 6-10
  for (let i = 6; i <= 10; i++) {
    cf = cf * (1 + growthRate6to10 / 100);
    totalPV += cf / Math.pow(1 + discountRate / 100, i);
  }

  // Terminal value: Year 10 CF × terminal multiple, discounted back
  const terminalValue = cf * terminalMultiple;
  const pvTerminal = terminalValue / Math.pow(1 + discountRate / 100, 10);

  const intrinsicValueTotal = totalPV + pvTerminal;
  const intrinsicValuePerShare = intrinsicValueTotal / sharesOutstanding;
  const intrinsicWithMargin = intrinsicValuePerShare * (1 - marginOfSafety / 100);
  const upside = ((intrinsicValuePerShare - currentPrice) / currentPrice) * 100;

  // Simple IRR approximation
  const irr = (Math.pow(intrinsicValuePerShare / currentPrice, 1 / 10) - 1) * 100;

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
