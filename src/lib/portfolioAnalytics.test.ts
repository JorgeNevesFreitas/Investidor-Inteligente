import { describe, it, expect } from "vitest";
import {
  computeXIRR, computeTWR, computeVolatility, computeMaxDrawdown,
  computeBeta, computeCumulativeIndex, annualizeReturn, computeSharpe,
  computeTopPerformers, computeSectorAllocation,
} from "@/lib/portfolioAnalytics";
import { Position } from "@/lib/portfolioService";
import { DBCompany } from "@/lib/financialDataService";

function makePosition(overrides: Partial<Position> & { ticker: string }): Position {
  return {
    company_name: overrides.ticker,
    currency: "USD",
    broker: "IBKR",
    current_qty: 10,
    wac: 100,
    current_price: 100,
    is_gift: false,
    basis_eur: 1000,
    invested_eur: 1000,
    current_value_eur: 1000,
    stock_return_eur: 0,
    realized_stock_eur: 0,
    unrealized_stock_eur: 0,
    stock_return_pct: 0,
    dividend_return_eur: 0,
    dividend_return_pct: 0,
    total_return_eur: 0,
    total_return_pct: 0,
    transactions: [],
    dividends: [],
    ...overrides,
  };
}

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

describe("computeTopPerformers", () => {
  it("ranks open, non-gift, non-zero-cost positions by total return %", () => {
    const positions = [
      makePosition({ ticker: "AAA", total_return_pct: 30, total_return_eur: 300 }),
      makePosition({ ticker: "BBB", total_return_pct: -20, total_return_eur: -200 }),
      makePosition({ ticker: "CCC", total_return_pct: 10, total_return_eur: 100 }),
      makePosition({ ticker: "DDD", total_return_pct: -5, total_return_eur: -50 }),
      makePosition({ ticker: "EEE", total_return_pct: 3, total_return_eur: 30 }),
      makePosition({ ticker: "FFF", total_return_pct: 1, total_return_eur: 10 }),
    ];
    const { best, worst } = computeTopPerformers(positions, 3);
    expect(best.map(p => p.ticker)).toEqual(["AAA", "CCC", "EEE"]);
    expect(worst.map(p => p.ticker)).toEqual(["BBB", "DDD", "FFF"]);
  });

  it("excludes gifted and zero-cost positions from the ranking", () => {
    const positions = [
      makePosition({ ticker: "GIFT", is_gift: true, total_return_pct: 500, total_return_eur: 500 }),
      makePosition({ ticker: "FREE", basis_eur: 0, total_return_pct: 999, total_return_eur: 0 }),
      makePosition({ ticker: "PAID", total_return_pct: 10, total_return_eur: 100 }),
    ];
    const { best } = computeTopPerformers(positions);
    expect(best.map(p => p.ticker)).toEqual(["PAID"]);
  });

  it("excludes closed positions (current_qty 0)", () => {
    const positions = [
      makePosition({ ticker: "CLOSED", current_qty: 0, total_return_pct: 50, total_return_eur: 50 }),
      makePosition({ ticker: "OPEN", total_return_pct: 10, total_return_eur: 100 }),
    ];
    const { best } = computeTopPerformers(positions);
    expect(best.map(p => p.ticker)).toEqual(["OPEN"]);
  });

  it("never lists the same position in both best and worst when there are few positions", () => {
    const positions = [
      makePosition({ ticker: "A", total_return_pct: 10 }),
      makePosition({ ticker: "B", total_return_pct: 5 }),
    ];
    const { best, worst } = computeTopPerformers(positions, 3);
    const bestTickers = new Set(best.map(p => p.ticker));
    for (const w of worst) expect(bestTickers.has(w.ticker)).toBe(false);
  });
});

describe("computeSectorAllocation", () => {
  const companies: DBCompany[] = [
    { id: "1", ticker: "AAA", sector: "Tech" } as DBCompany,
    { id: "2", ticker: "BBB", sector: "Tech" } as DBCompany,
    { id: "3", ticker: "CCC", sector: "Healthcare" } as DBCompany,
  ];

  it("groups open positions by sector and lists companies within each", () => {
    const positions = [
      makePosition({ ticker: "AAA", current_value_eur: 600 }),
      makePosition({ ticker: "BBB", current_value_eur: 400 }),
      makePosition({ ticker: "CCC", current_value_eur: 1000 }),
    ];
    const allocation = computeSectorAllocation(positions, companies);
    expect(allocation).toHaveLength(2);

    const healthcare = allocation.find(a => a.sector === "Healthcare")!;
    expect(healthcare.valueEur).toBe(1000);
    expect(healthcare.pct).toBeCloseTo(50, 6);
    expect(healthcare.companies).toEqual([{ ticker: "CCC", name: "CCC", valueEur: 1000 }]);

    const tech = allocation.find(a => a.sector === "Tech")!;
    expect(tech.companies.map(c => c.ticker)).toEqual(["AAA", "BBB"]); // sorted by value desc
  });

  it("falls back to 'Outro' for companies with no sector on record", () => {
    const positions = [makePosition({ ticker: "ZZZ", current_value_eur: 100 })];
    const allocation = computeSectorAllocation(positions, []);
    expect(allocation).toEqual([{ sector: "Outro", valueEur: 100, pct: 100, companies: [{ ticker: "ZZZ", name: "ZZZ", valueEur: 100 }] }]);
  });
});
