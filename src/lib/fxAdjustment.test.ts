import { describe, it, expect } from "vitest";
import {
  computeFxAdjustment, splitFxAdjustment, cashBalanceFor, parseSignedNumber, fxAdjustmentCurrency,
} from "./fxAdjustment";
import { PortfolioCash } from "./portfolioService";

const base = { totalPortfolioEur: 10000, fxAdjustmentsEur: -50, appCashBalance: 200 };

describe("computeFxAdjustment", () => {
  it("portfolio_total: broker minus app total", () => {
    expect(computeFxAdjustment({ ...base, mode: "portfolio_total", value: 9800 })).toBeCloseTo(-200);
  });
  it("fx_effect: broker minus registered FX", () => {
    expect(computeFxAdjustment({ ...base, mode: "fx_effect", value: -120 })).toBeCloseTo(-70);
  });
  it("cash_balance: real minus app balance", () => {
    expect(computeFxAdjustment({ ...base, mode: "cash_balance", value: 212.34 })).toBeCloseTo(12.34);
  });
  it("direct: value as-is, NaN on invalid", () => {
    expect(computeFxAdjustment({ ...base, mode: "direct", value: -5 })).toBe(-5);
    expect(computeFxAdjustment({ ...base, mode: "direct", value: NaN })).toBeNaN();
  });
});

describe("helpers", () => {
  it("parseSignedNumber accepts comma and negatives", () => {
    expect(parseSignedNumber("-12,5")).toBe(-12.5);
    expect(parseSignedNumber("")).toBeNaN();
    expect(parseSignedNumber("-")).toBeNaN();
  });
  it("fxAdjustmentCurrency forces EUR in modes 1/2", () => {
    expect(fxAdjustmentCurrency("portfolio_total", "USD")).toBe("EUR");
    expect(fxAdjustmentCurrency("cash_balance", "USD")).toBe("USD");
  });
  it("cashBalanceFor filters broker + currency", () => {
    const rows = [
      { broker: "IBKR", currency: "USD", amount: 100 },
      { broker: "IBKR", currency: "USD", amount: -30 },
      { broker: "IBKR", currency: "EUR", amount: 999 },
      { broker: "Degiro", currency: "USD", amount: 999 },
    ] as PortfolioCash[];
    expect(cashBalanceFor(rows, "IBKR", "USD")).toBe(70);
  });
});

describe("splitFxAdjustment", () => {
  it("splits by weights with signed amounts and positive percentages", () => {
    const s = splitFxAdjustment(-100, ["a", "b"], [{ member_id: "a", pct: 0.75 }, { member_id: "b", pct: 0.25 }]);
    expect(s.map(x => x.amount)).toEqual([-75, -25]);
    expect(s.map(x => x.percentage)).toEqual([75, 25]);
  });
  it("falls back to equal split when weights are empty or zero", () => {
    expect(splitFxAdjustment(30, ["a", "b", "c"], []).map(x => x.amount)).toEqual([10, 10, 10]);
    expect(splitFxAdjustment(30, ["a", "b"], [{ member_id: "a", pct: 0 }]).map(x => x.percentage)).toEqual([50, 50]);
  });
});
