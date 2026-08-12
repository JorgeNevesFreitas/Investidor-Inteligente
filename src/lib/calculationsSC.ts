/**
 * src/lib/calculationsSC.ts
 *
 * Módulo de cálculo do "Valuation SC" (Sven Carlin), com 3 cenários ponderados
 * (normal / otimista / pessimista), fiel à folha Excel "Intrinsic Value
 * Calculation Formula - Sven Carlin" (sheet template "= (3)").
 *
 * Validado numericamente contra a folha:
 *  - Template mestre (I3=1, probabilidades 60/20/20): resultado ponderado = 20.167362422742677
 *  - Folha APPLE (I3=0, probabilidades 70/15/15): resultado ponderado = 83.51886077979238
 *
 * Não mexe em src/lib/calculations.ts nem no DCFCalculator existente — este é um
 * módulo novo e independente, para a nova aba "Valuation SC".
 *
 * PARTICULARIDADE REPLICADA DA FOLHA (propositadamente, para bater sempre certo
 * com o Excel): o Valor Terminal do Cenário 2 desconta sempre à taxa de desconto
 * do Cenário 1 (célula O7), mesmo que o utilizador defina uma taxa diferente no
 * Cenário 2 (célula O13). Na folha original, O13 nunca é alterado em nenhuma das
 * ações analisadas, por isso isto nunca produziu diferenças na prática, mas o
 * comportamento está aqui replicado tal e qual.
 */

export type ValuationMethod = "fcf" | "eps";

export interface ScenarioInputs {
  /** Valor base por ação (FCF por ação ou EPS), ano mais recente. Equivalente a C6 / C12 / C18. */
  baseValuePerShare: number;
  /** Taxa de crescimento anos 1 a 5, em %. Equivalente a O5 / O11 / O17. */
  growthRate1to5: number;
  /** Taxa de crescimento anos 6 a 10, em %. Equivalente a O6 / O12 / O18. */
  growthRate6to10: number;
  /** Taxa de desconto, em %. Equivalente a O7 / O13 / O19. */
  discountRate: number;
  /** Múltiplo terminal. Equivalente a O8 / O14 / O20. */
  terminalMultiple: number;
  /** Probabilidade do cenário, em %. Equivalente a D23 / D24 / D25. */
  probability: number;
}

export interface SCValuationInputs {
  method: ValuationMethod;
  /** Dividend Payout Ratio, em % (0-100). Equivalente a I3. Multiplica os 10 fluxos anuais, não o valor terminal. */
  dividendPayoutRatio: number;
  /** Margem de segurança, em %. Aplicada ao valor final ponderado. */
  marginOfSafety: number;
  scenario1: ScenarioInputs; // normal case
  scenario2: ScenarioInputs; // best case
  scenario3: ScenarioInputs; // worst case
}

export interface ScenarioProjectionRow {
  yearOffset: number; // 1 a 10
  cashFlow: number;
  presentValue: number;
}

export interface ScenarioResult {
  rows: ScenarioProjectionRow[]; // 10 anos
  year9CashFlow: number;
  terminalValue: number;
  presentValueTerminal: number;
  /** Valor intrínseco por ação deste cenário (equivalente a D8 / D14 / D20). */
  intrinsicValuePerShare: number;
}

export interface SCValuationResult {
  scenario1: ScenarioResult;
  scenario2: ScenarioResult;
  scenario3: ScenarioResult;
  /** Equivalente a F26: soma ponderada pelas probabilidades. */
  weightedIntrinsicValuePerShare: number;
  weightedIntrinsicValueTotal: number;
  weightedWithMargin: number;
  currentPrice: number;
  upside: number;
  /** Taxa de desconto que faz o valor intrínseco ponderado igualar o preço atual, em %. Equivalente ao IRR do DCF. */
  impliedDiscountRate: number;
  status: "invest" | "watch" | "wait";
}

function computeScenario(
  baseValuePerShare: number,
  growthRate1to5Pct: number,
  growthRate6to10Pct: number,
  yearDiscountRatePct: number,
  terminalDiscountRatePct: number,
  terminalMultiple: number,
  dividendPayoutRatioDecimal: number
): ScenarioResult {
  const g1 = growthRate1to5Pct / 100;
  const g2 = growthRate6to10Pct / 100;
  const yearRate = yearDiscountRatePct / 100;
  const terminalRate = terminalDiscountRatePct / 100;

  const cashFlows: number[] = [];
  let cf = baseValuePerShare;
  for (let i = 0; i < 5; i++) {
    cf = cf * (1 + g1);
    cashFlows.push(cf);
  }
  for (let i = 0; i < 5; i++) {
    cf = cf * (1 + g2);
    cashFlows.push(cf);
  }

  const year9CashFlow = cashFlows[8];
  const terminalValue = year9CashFlow * terminalMultiple;

  const rows: ScenarioProjectionRow[] = cashFlows.map((c, i) => ({
    yearOffset: i + 1,
    cashFlow: c,
    presentValue: (c / Math.pow(1 + yearRate, i + 1)) * dividendPayoutRatioDecimal,
  }));

  const presentValueTerminal = terminalValue / Math.pow(1 + terminalRate, 10);

  const intrinsicValuePerShare =
    rows.reduce((sum, r) => sum + r.presentValue, 0) + presentValueTerminal;

  return { rows, year9CashFlow, terminalValue, presentValueTerminal, intrinsicValuePerShare };
}

function weightedIntrinsicAtDiscountRate(inputs: SCValuationInputs, ratePct: number): number {
  const payout = inputs.dividendPayoutRatio / 100;

  const v1 = computeScenario(
    inputs.scenario1.baseValuePerShare,
    inputs.scenario1.growthRate1to5,
    inputs.scenario1.growthRate6to10,
    ratePct,
    ratePct,
    inputs.scenario1.terminalMultiple,
    payout
  ).intrinsicValuePerShare;

  const v2 = computeScenario(
    inputs.scenario2.baseValuePerShare,
    inputs.scenario2.growthRate1to5,
    inputs.scenario2.growthRate6to10,
    ratePct,
    ratePct,
    inputs.scenario2.terminalMultiple,
    payout
  ).intrinsicValuePerShare;

  const v3 = computeScenario(
    inputs.scenario3.baseValuePerShare,
    inputs.scenario3.growthRate1to5,
    inputs.scenario3.growthRate6to10,
    ratePct,
    ratePct,
    inputs.scenario3.terminalMultiple,
    payout
  ).intrinsicValuePerShare;

  const p1 = inputs.scenario1.probability / 100;
  const p2 = inputs.scenario2.probability / 100;
  const p3 = inputs.scenario3.probability / 100;

  return v1 * p1 + v2 * p2 + v3 * p3;
}

export function calculateSvenCarlinValuation(
  inputs: SCValuationInputs,
  sharesOutstanding: number,
  currentPrice: number
): SCValuationResult {
  const payout = inputs.dividendPayoutRatio / 100;

  const scenario1 = computeScenario(
    inputs.scenario1.baseValuePerShare,
    inputs.scenario1.growthRate1to5,
    inputs.scenario1.growthRate6to10,
    inputs.scenario1.discountRate,
    inputs.scenario1.discountRate,
    inputs.scenario1.terminalMultiple,
    payout
  );

  const scenario2 = computeScenario(
    inputs.scenario2.baseValuePerShare,
    inputs.scenario2.growthRate1to5,
    inputs.scenario2.growthRate6to10,
    inputs.scenario2.discountRate,
    inputs.scenario1.discountRate,
    inputs.scenario2.terminalMultiple,
    payout
  );

  const scenario3 = computeScenario(
    inputs.scenario3.baseValuePerShare,
    inputs.scenario3.growthRate1to5,
    inputs.scenario3.growthRate6to10,
    inputs.scenario3.discountRate,
    inputs.scenario3.discountRate,
    inputs.scenario3.terminalMultiple,
    payout
  );

  const p1 = inputs.scenario1.probability / 100;
  const p2 = inputs.scenario2.probability / 100;
  const p3 = inputs.scenario3.probability / 100;

  const weightedIntrinsicValuePerShare =
    scenario1.intrinsicValuePerShare * p1 +
    scenario2.intrinsicValuePerShare * p2 +
    scenario3.intrinsicValuePerShare * p3;

  const weightedIntrinsicValueTotal = weightedIntrinsicValuePerShare * sharesOutstanding;
  const weightedWithMargin = weightedIntrinsicValuePerShare * (1 - inputs.marginOfSafety / 100);
  const upside = ((weightedIntrinsicValuePerShare - currentPrice) / currentPrice) * 100;

  let status: SCValuationResult["status"] = "wait";
  if (currentPrice <= weightedWithMargin) status = "invest";
  else if (currentPrice <= weightedIntrinsicValuePerShare) status = "watch";

  // Taxa de desconto implícita ao preço atual, por bisseção
  let lo = -50, hi = 200;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const v = weightedIntrinsicAtDiscountRate(inputs, mid);
    if (v > currentPrice) lo = mid; else hi = mid;
  }
  const impliedDiscountRate = (lo + hi) / 2;

  return {
    scenario1,
    scenario2,
    scenario3,
    weightedIntrinsicValuePerShare,
    weightedIntrinsicValueTotal,
    weightedWithMargin,
    currentPrice,
    upside,
    impliedDiscountRate,
    status,
  };
}

export const SC_DEFAULT_INPUTS: Omit<SCValuationInputs, "method" | "dividendPayoutRatio" | "marginOfSafety"> = {
  scenario1: {
    baseValuePerShare: 0,
    growthRate1to5: 8,
    growthRate6to10: 8,
    discountRate: 10,
    terminalMultiple: 15,
    probability: 60,
  },
  scenario2: {
    baseValuePerShare: 0,
    growthRate1to5: 10,
    growthRate6to10: 10,
    discountRate: 10,
    terminalMultiple: 30,
    probability: 20,
  },
  scenario3: {
    baseValuePerShare: 0,
    growthRate1to5: 4,
    growthRate6to10: 4,
    discountRate: 10,
    terminalMultiple: 10,
    probability: 20,
  },
};
