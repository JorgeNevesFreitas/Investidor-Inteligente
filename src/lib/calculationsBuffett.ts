// src/lib/calculationsBuffett.ts
//
// Modelo de valuation "estilo Buffett": um único cenário, Owner Earnings,
// crescimento perpétuo (Gordon Growth) em vez de Terminal Multiple, e taxa
// de desconto pensada para refletir a yield das obrigações do tesouro (o
// risco do negócio fica fora da taxa, é filtrado na escolha da empresa e
// compensado pela margem de segurança).
//
// Owner Earnings = Lucro Líquido + D&A - Capex - ΔWorking Capital
// Se faltarem D&A, Capex, Current Assets ou Current Liabilities num
// determinado ano (import incompleto), cai para o FCF já existente como
// aproximação, para nunca dar um resultado disparatado.
//
// O crescimento dos 10 anos de projeção (growthRateNearTerm) é independente
// do crescimento perpétuo usado na perpetuidade (growthRatePerpetual): uma
// empresa pode crescer bem acima da economia durante alguns anos, mas
// ninguém cresce a esse ritmo para sempre. A fórmula só exige que a taxa de
// desconto seja maior do que o crescimento PERPÉTUO, nunca do que o
// crescimento dos 10 anos.

import { FinancialYear } from "./mockData";

export interface OwnerEarningsYear {
  year: number;
  ownerEarnings: number;
  ownerEarningsGrowth: number | null;
  isApproximated: boolean; // true = caiu no fallback do FCF por faltarem dados
  netIncome: number;
  depreciationAmortization: number;
  capexUsed: number; // valor absoluto usado na fórmula
  deltaWorkingCapital: number;
}

export function computeOwnerEarningsSeries(financials: FinancialYear[]): OwnerEarningsYear[] {
  const raw: { year: number; ownerEarnings: number; isApproximated: boolean; netIncome: number; depreciationAmortization: number; capexUsed: number; deltaWorkingCapital: number }[] = [];

  for (let i = 0; i < financials.length; i++) {
    const cur = financials[i];
    const prev = i > 0 ? financials[i - 1] : null;

    const hasCoreData =
      cur.depreciationAmortization !== undefined && cur.depreciationAmortization !== null &&
      cur.capex !== undefined && cur.capex !== null &&
      cur.currentAssets !== undefined && cur.currentAssets !== null &&
      cur.currentLiabilities !== undefined && cur.currentLiabilities !== null;

    if (!hasCoreData) {
      raw.push({ year: cur.year, ownerEarnings: cur.fcf, isApproximated: true, netIncome: cur.netIncome, depreciationAmortization: 0, capexUsed: 0, deltaWorkingCapital: 0 });
      continue;
    }

    const workingCapitalNow = (cur.currentAssets ?? 0) - (cur.currentLiabilities ?? 0);
    const workingCapitalPrev = prev && prev.currentAssets !== undefined && prev.currentLiabilities !== undefined
      ? (prev.currentAssets ?? 0) - (prev.currentLiabilities ?? 0)
      : workingCapitalNow;
    const deltaWorkingCapital = workingCapitalNow - workingCapitalPrev;

    let ownerEarnings = cur.netIncome + (cur.depreciationAmortization ?? 0) - Math.abs(cur.capex ?? 0) - deltaWorkingCapital;
    let isApproximated = false;

    if (!isFinite(ownerEarnings) || ownerEarnings === 0) {
      ownerEarnings = cur.fcf;
      isApproximated = true;
    }

    raw.push({ year: cur.year, ownerEarnings, isApproximated, netIncome: cur.netIncome, depreciationAmortization: cur.depreciationAmortization ?? 0, capexUsed: Math.abs(cur.capex ?? 0), deltaWorkingCapital });
  }

  return raw.map((r, i) => {
    const prevOE = i > 0 ? raw[i - 1].ownerEarnings : null;
    const growth = prevOE && prevOE !== 0 ? ((r.ownerEarnings - prevOE) / Math.abs(prevOE)) * 100 : null;
    return { year: r.year, ownerEarnings: r.ownerEarnings, ownerEarningsGrowth: growth, isApproximated: r.isApproximated, netIncome: r.netIncome, depreciationAmortization: r.depreciationAmortization, capexUsed: r.capexUsed, deltaWorkingCapital: r.deltaWorkingCapital };
  });
}

/** Considera divergência "grande" quando a diferença relativa ao FCF ultrapassa 40%, ou quando os sinais são opostos. */
export function isSignificantDivergence(ownerEarnings: number, fcf: number): boolean {
  if (fcf === 0) return ownerEarnings !== 0;
  if (Math.sign(ownerEarnings) !== Math.sign(fcf) && ownerEarnings !== 0) return true;
  const relDiff = Math.abs(ownerEarnings - fcf) / Math.abs(fcf);
  return relDiff > 0.4;
}

export function computeOwnerEarnings(financials: FinancialYear[]): number {
  const series = computeOwnerEarningsSeries(financials);
  if (series.length === 0) return 0;
  return series[series.length - 1].ownerEarnings;
}

export interface BuffettInputs {
  baseOwnerEarnings: number; // total da empresa, $M
  growthRateNearTerm: number; // % ao ano, anos 1 a 10
  growthRatePerpetual: number; // % perpétuo, só para a perpetuidade (g)
  discountRate: number; // % (r)
  marginOfSafety: number; // %
}

export interface BuffettProjectionRow {
  year: number; // 1 a 10
  ownerEarnings: number;
  presentValue: number;
}

export interface BuffettResult {
  rows: BuffettProjectionRow[];
  terminalValue: number;
  presentValueTerminal: number;
  intrinsicValueTotal: number;
  intrinsicValuePerShare: number;
  intrinsicWithMargin: number;
  currentPrice: number;
  upside: number;
  irrAtCurrentPrice: number;
  irrAtMarginPrice: number;
  status: "invest" | "watch" | "wait";
  invalidRate: boolean;
}

function computeTotal(base: number, gNearPct: number, gPerpPct: number, rPct: number): { rows: BuffettProjectionRow[]; terminalValue: number; presentValueTerminal: number; total: number; invalid: boolean } {
  const gNear = gNearPct / 100;
  const gPerp = gPerpPct / 100;
  const r = rPct / 100;

  if (r <= gPerp) {
    return { rows: [], terminalValue: 0, presentValueTerminal: 0, total: 0, invalid: true };
  }

  const rows: BuffettProjectionRow[] = [];
  let oe = base;
  for (let t = 1; t <= 10; t++) {
    oe = oe * (1 + gNear);
    rows.push({ year: t, ownerEarnings: oe, presentValue: oe / Math.pow(1 + r, t) });
  }

  const oe10 = rows[9].ownerEarnings;
  const terminalValue = (oe10 * (1 + gPerp)) / (r - gPerp);
  const presentValueTerminal = terminalValue / Math.pow(1 + r, 10);

  const total = rows.reduce((sum, row) => sum + row.presentValue, 0) + presentValueTerminal;

  return { rows, terminalValue, presentValueTerminal, total, invalid: false };
}

export function calculateBuffettValuation(
  inputs: BuffettInputs,
  sharesOutstanding: number,
  currentPrice: number
): BuffettResult {
  const { baseOwnerEarnings, growthRateNearTerm, growthRatePerpetual, discountRate, marginOfSafety } = inputs;

  const main = computeTotal(baseOwnerEarnings, growthRateNearTerm, growthRatePerpetual, discountRate);

  if (main.invalid || sharesOutstanding <= 0) {
    return {
      rows: main.rows,
      terminalValue: main.terminalValue,
      presentValueTerminal: main.presentValueTerminal,
      intrinsicValueTotal: 0,
      intrinsicValuePerShare: 0,
      intrinsicWithMargin: 0,
      currentPrice,
      upside: 0,
      irrAtCurrentPrice: 0,
      irrAtMarginPrice: 0,
      status: "wait",
      invalidRate: true,
    };
  }

  const intrinsicValueTotal = main.total;
  const intrinsicValuePerShare = intrinsicValueTotal / sharesOutstanding;
  const intrinsicWithMargin = intrinsicValuePerShare * (1 - marginOfSafety / 100);
  const upside = ((intrinsicValuePerShare - currentPrice) / currentPrice) * 100;

  const solveImpliedRate = (targetPricePerShare: number): number => {
    let lo = growthRatePerpetual + 0.01;
    let hi = 100;
    for (let iter = 0; iter < 100; iter++) {
      const mid = (lo + hi) / 2;
      const r = computeTotal(baseOwnerEarnings, growthRateNearTerm, growthRatePerpetual, mid);
      const valuePerShare = r.invalid ? Infinity : r.total / sharesOutstanding;
      if (valuePerShare > targetPricePerShare) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const irrAtCurrentPrice = currentPrice > 0 ? solveImpliedRate(currentPrice) : 0;
  const irrAtMarginPrice = intrinsicWithMargin > 0 ? solveImpliedRate(intrinsicWithMargin) : 0;

  let status: BuffettResult["status"] = "wait";
  if (currentPrice <= intrinsicWithMargin) status = "invest";
  else if (currentPrice <= intrinsicValuePerShare) status = "watch";

  return {
    rows: main.rows,
    terminalValue: main.terminalValue,
    presentValueTerminal: main.presentValueTerminal,
    intrinsicValueTotal,
    intrinsicValuePerShare,
    intrinsicWithMargin,
    currentPrice,
    upside,
    irrAtCurrentPrice,
    irrAtMarginPrice,
    status,
    invalidRate: false,
  };
}
