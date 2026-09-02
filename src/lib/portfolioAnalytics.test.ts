import { describe, it, expect } from "vitest";
import {
  computeXIRR, computeTWR, computeVolatility, computeMaxDrawdown,
  computeBeta, computeCumulativeIndex, annualizeReturn, computeSharpe,
} from "@/lib/portfolioAnalytics";

describe("computeXIRR", () => {
  it("matches simple annualized interest for a single deposit + final value", () => {
    // Deposit 1000 exactly one year ago, worth 1100 today → ~10% XIRR
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const rate = computeXIRR([
      { date: oneYearAgo.toISOString().slice(0, 10), amount: -1000 },
      { date: new Date().toISOString().slice(0, 10), amount: 1100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 2);
  });

  it("returns null when there are fewer than 2 cash flows", () => {
    expect(computeXIRR([{ date: "2026-01-01", amount: -1000 }])).toBeNull();
  });

  it("returns null when all cash flows have the same sign", () => {
    expect(computeXIRR([
      { date: "2025-01-01", amount: 1000 },
      { date: "2026-01-01", amount: 500 },
    ])).toBeNull();
  });
});

describe("computeTWR", () => {
  it("chains daily returns geometrically", () => {
    // +10% then -5% => 1.1 * 0.95 - 1 = 0.045
    expect(computeTWR([0.1, -0.05])).toBeCloseTo(0.045, 6);
  });

  it("returns null for an empty series", () => {
    expect(computeTWR([])).toBeNull();
  });
});

describe("computeCumulativeIndex / computeMaxDrawdown", () => {
  it("finds the largest peak-to-trough decline", () => {
    // index: 100 -> 120 -> 90 -> 110  => drawdown from 120 to 90 = -25%
    const idx = computeCumulativeIndex([0.2, -0.25, 0.222222]);
    expect(computeMaxDrawdown(idx)).toBeCloseTo(-0.25, 2);
  });

  it("returns null for fewer than 2 points", () => {
    expect(computeMaxDrawdown([100])).toBeNull();
  });
});

describe("computeVolatility", () => {
  it("returns null for fewer than 2 returns", () => {
    expect(computeVolatility([0.01])).toBeNull();
  });

  it("is zero for a constant return series", () => {
    expect(computeVolatility([0.01, 0.01, 0.01])).toBeCloseTo(0, 6);
  });
});

describe("computeBeta", () => {
  it("is ~1 when portfolio returns move identically to the benchmark", () => {
    const beta = computeBeta([0.01, -0.02, 0.03, 0.005], [0.01, -0.02, 0.03, 0.005]);
    expect(beta).not.toBeNull();
    expect(beta!).toBeCloseTo(1, 5);
  });

  it("ignores unpaired NaN entries", () => {
    const beta = computeBeta([0.01, NaN, 0.03], [0.01, 0.02, 0.03]);
    expect(beta).not.toBeNull();
    expect(beta!).toBeCloseTo(1, 5);
  });

  it("returns null when fewer than 2 valid pairs exist", () => {
    expect(computeBeta([0.01], [0.01])).toBeNull();
  });
});

describe("annualizeReturn / computeSharpe", () => {
  it("annualizes a 6-month return to roughly double the rate", () => {
    const annual = annualizeReturn(0.05, 182.5);
    expect(annual).not.toBeNull();
    expect(annual!).toBeGreaterThan(0.09);
    expect(annual!).toBeLessThan(0.12);
  });

  it("computes Sharpe ratio relative to the risk-free rate", () => {
    expect(computeSharpe(0.12, 0.2, 0.02)).toBeCloseTo(0.5, 6);
  });

  it("returns null when volatility is zero", () => {
    expect(computeSharpe(0.1, 0)).toBeNull();
  });
});
