import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import {
  PortfolioTransaction, PortfolioDividend, Position, PortfolioMember,
  PortfolioCash, PortfolioCashMember, PortfolioDailySnapshot,
  computePositions, fetchTransactions, fetchDividends,
  fetchMembers, fetchCash, fetchCashMembers, fetchDailySnapshots,
} from "@/lib/portfolioService";
import {
  computeMWR, computeAlignedReturns, computeTWR, computeVolatility,
  computeCumulativeIndex, computeMaxDrawdown, annualizeReturn, computeSharpe,
  computeBeta, computeSectorAllocation,
} from "@/lib/portfolioAnalytics";
import { fetchMarketPrice, MarketPriceResult } from "@/lib/marketPriceService";
import { listCompanies, DBCompany } from "@/lib/financialDataService";
import { SummaryCards, MemberValueBreakdown, TopPositionByValue, TopPositionByReturn, DividendByCompany } from "@/components/portfolio-v2/SummaryCards";
import { InvestorPanel, MemberPanelData } from "@/components/portfolio-v2/InvestorPanel";
import { KpiPanel } from "@/components/portfolio-v2/KpiPanel";
import { PositionsTable } from "@/components/portfolio-v2/PositionsTable";

export default function PortfolioV2() {
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [dividends, setDividends] = useState<PortfolioDividend[]>([]);
  const [companies, setCompanies] = useState<DBCompany[]>([]);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [eurUsd, setEurUsd] = useState<number>(1.09);
  const [members, setMembers] = useState<PortfolioMember[]>([]);
  const [cashEntries, setCashEntries] = useState<PortfolioCash[]>([]);
  const [cashMemberEntries, setCashMemberEntries] = useState<PortfolioCashMember[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioDailySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    const [txns, divs] = await Promise.all([fetchTransactions(), fetchDividends()]);
    setTransactions(txns);
    setDividends(divs);
    try {
      const [cash, cashMs, snaps] = await Promise.all([fetchCash(), fetchCashMembers(), fetchDailySnapshots()]);
      setCashEntries(cash);
      setCashMemberEntries(cashMs);
      setSnapshots(snaps);
    } catch {
      // portfolio_daily_snapshot / cash tables may not exist yet — silent fallback
    }
    return { txns, divs };
  };

  const doFetchPrices = async (txns: PortfolioTransaction[], divs: PortfolioDividend[]) => {
    const tickers = [...new Set([...txns.map(t => t.ticker.toUpperCase()), ...divs.map(d => d.ticker.toUpperCase())])];
    if (tickers.length === 0) return;
    setPricesLoading(true);
    try {
      const eurResult: MarketPriceResult = await fetchMarketPrice("EURUSD=X");
      if (eurResult.status === "success" && eurResult.price > 0) setEurUsd(eurResult.price);
      const results = await Promise.all(
        tickers.map(ticker => fetchMarketPrice(ticker).then(r => ({ ticker, price: r.price, ok: r.status === "success" })))
      );
      const map = new Map<string, number>();
      for (const r of results) if (r.ok && r.price > 0) map.set(r.ticker, r.price);
      setPrices(map);
    } finally {
      setPricesLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [{ txns, divs }] = await Promise.all([
          loadAll(),
          listCompanies().then(setCompanies).catch(() => {}),
          fetchMembers().then(setMembers).catch(() => {}),
        ]);
        await doFetchPrices(txns, divs);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────

  const companyByTicker = useMemo(() => {
    const m = new Map<string, DBCompany>();
    for (const c of companies) m.set(c.ticker.toUpperCase(), c);
    return m;
  }, [companies]);

  const companyNotesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) if (c.notes?.trim()) m.set(c.ticker.toUpperCase(), c.notes);
    return m;
  }, [companies]);

  const positions: Position[] = useMemo(
    () => computePositions(transactions, dividends, prices, new Map(companies.map(c => [c.ticker.toUpperCase(), c.name])), eurUsd),
    [transactions, dividends, prices, companies, eurUsd]
  );

  const openPositions = useMemo(() => positions.filter(p => p.current_qty > 0), [positions]);

  const totals = useMemo(() => {
    const basisEur = positions.reduce((s, p) => s + p.basis_eur, 0);
    const investedEur = positions.reduce((s, p) => s + p.invested_eur, 0);
    const currentEur = positions.reduce((s, p) => s + p.current_value_eur, 0);
    const stockEur = positions.reduce((s, p) => s + p.stock_return_eur, 0);
    const divEur = positions.reduce((s, p) => s + p.dividend_return_eur, 0);
    return {
      basisEur, investedEur, currentEur, stockEur, divEur,
      stockPct: basisEur > 0 ? (stockEur / basisEur) * 100 : 0,
    };
  }, [positions]);

  const cashByBroker = useMemo(() => {
    const map = new Map<string, { eur: number; usd: number }>();
    for (const entry of cashEntries) {
      const cur = map.get(entry.broker) ?? { eur: 0, usd: 0 };
      if (entry.currency === "EUR") cur.eur += entry.amount; else cur.usd += entry.amount;
      map.set(entry.broker, cur);
    }
    return Array.from(map.entries()).map(([broker, bal]) => ({ broker, ...bal })).sort((a, b) => a.broker.localeCompare(b.broker));
  }, [cashEntries]);

  const totalCashEur = useMemo(() => cashByBroker.reduce((s, b) => s + b.eur + b.usd / eurUsd, 0), [cashByBroker, eurUsd]);

  const totalDepositedEur = useMemo(
    () => cashEntries.filter(e => e.type === "deposit").reduce((s, e) => s + (e.currency === "EUR" ? e.amount : e.amount / eurUsd), 0),
    [cashEntries, eurUsd]
  );

  // Net capital contributed (deposits minus withdrawals). `portfolio_cash` stores withdrawal
  // amounts already negative, so deposits and withdrawals can just be summed together.
  const netContributedEur = useMemo(
    () => cashEntries
      .filter(e => e.type === "deposit" || e.type === "withdrawal")
      .reduce((s, e) => s + (e.currency === "EUR" ? e.amount : e.amount / eurUsd), 0),
    [cashEntries, eurUsd]
  );

  // Total portfolio value = net capital contributed + cumulative stock return + dividends received.
  // Deliberately NOT liquidity + current position value: buying shares moves money from cash into
  // positions (liquidity down, invested up, total unchanged) and must never move the total by itself.
  // Computing it that way also depends on every buy/sell/dividend having a matching portfolio_cash
  // entry, which isn't guaranteed — deposits/withdrawals (real bank transfers) are the reliable source.
  const portfolioGainLossEur = totals.stockEur + totals.divEur;
  const totalPortfolioEur = netContributedEur + portfolioGainLossEur;
  const portfolioGainLossPct = totalDepositedEur > 0 ? (portfolioGainLossEur / totalDepositedEur) * 100 : 0;

  const fxNeutralTotal = useMemo(() =>
    positions.reduce((s, p) => {
      const factor = p.currency !== "EUR" ? eurUsd : 1;
      return s + (p.stock_return_eur + p.dividend_return_eur) * factor;
    }, 0),
    [positions, eurUsd]
  );
  const fxEffect = (totals.stockEur + totals.divEur) - fxNeutralTotal;

  // Each member's weight is FIXED: their share of total deposits (their portfolio_cash_members
  // splits of deposit-type portfolio_cash rows), converted to EUR. That single percentage is then
  // applied proportionally to every aggregate figure — total value, invested, liquidity, stock
  // return, dividends — rather than attributing each ticker/broker independently.
  const memberStats = useMemo(() => {
    if (members.length === 0) return [];

    const cashById = new Map(cashEntries.map(e => [e.id, e]));
    const toEur = (amount: number, currency: string) => (currency === "EUR" ? amount : amount / eurUsd);

    const depositedByMember = new Map<string, number>(members.map(m => [m.id, 0]));
    for (const cm of cashMemberEntries) {
      const entry = cashById.get(cm.cash_id);
      if (!entry || entry.type !== "deposit" || !depositedByMember.has(cm.member_id)) continue;
      depositedByMember.set(cm.member_id, (depositedByMember.get(cm.member_id) ?? 0) + toEur(cm.amount, entry.currency));
    }
    const totalDepositedByMembers = Array.from(depositedByMember.values()).reduce((s, v) => s + v, 0);

    const totalReturnPct = totals.basisEur > 0 ? ((totals.stockEur + totals.divEur) / totals.basisEur) * 100 : 0;

    return members.map(member => {
      const depositedEur = depositedByMember.get(member.id) ?? 0;
      const pct = totalDepositedByMembers > 0 ? depositedEur / totalDepositedByMembers : 1 / members.length;

      const stockReturnEur = totals.stockEur * pct;
      const dividendReturnEur = totals.divEur * pct;

      return {
        member,
        pct,
        depositedEur,
        totalValueEur: totalPortfolioEur * pct,
        investedEur: totals.currentEur * pct,
        cashEur: totalCashEur * pct,
        stockReturnEur,
        stockReturnPct: totals.stockPct,
        dividendReturnEur,
        totalReturnEur: stockReturnEur + dividendReturnEur,
        totalPct: totalReturnPct,
      };
    });
  }, [members, cashEntries, cashMemberEntries, totals, totalPortfolioEur, totalCashEur, eurUsd]);

  const memberValueBreakdown: MemberValueBreakdown[] = useMemo(() =>
    memberStats.map(ms => ({
      member: ms.member,
      totalValueEur: ms.totalValueEur,
      pct: ms.pct * 100,
      gainLossEur: ms.totalReturnEur,
    })),
    [memberStats]
  );

  const memberPanelData: MemberPanelData[] = useMemo(() =>
    memberStats.map(ms => ({
      member: ms.member,
      weightPct: ms.pct * 100,
      depositedEur: ms.depositedEur,
      totalValueEur: ms.totalValueEur,
      investedEur: ms.investedEur,
      cashEur: ms.cashEur,
      stockReturnEur: ms.stockReturnEur,
      stockReturnPct: ms.stockReturnPct,
      dividendReturnEur: ms.dividendReturnEur,
      totalReturnEur: ms.totalReturnEur,
      totalPct: ms.totalPct,
    })),
    [memberStats]
  );

  const top5ByValue: TopPositionByValue[] = useMemo(() => {
    const totalOpenValueEur = openPositions.reduce((s, p) => s + p.current_value_eur, 0);
    return [...openPositions]
      .sort((a, b) => b.current_value_eur - a.current_value_eur)
      .slice(0, 5)
      .map(p => ({
        ticker: p.ticker,
        name: p.company_name || p.ticker,
        valueEur: p.current_value_eur,
        weightPct: totalOpenValueEur > 0 ? (p.current_value_eur / totalOpenValueEur) * 100 : 0,
      }));
  }, [openPositions]);

  const top5ByReturn: TopPositionByReturn[] = useMemo(() =>
    [...positions]
      .sort((a, b) => b.stock_return_eur - a.stock_return_eur)
      .slice(0, 5)
      .map(p => ({ ticker: p.ticker, name: p.company_name || p.ticker, returnEur: p.stock_return_eur, returnPct: p.stock_return_pct })),
    [positions]
  );

  const dividendsByCompany: DividendByCompany[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dividends) {
      const amountEur = d.currency === "EUR" ? d.amount_per_share * d.quantity : (d.amount_per_share * d.quantity) / eurUsd;
      const key = d.ticker.toUpperCase();
      map.set(key, (map.get(key) ?? 0) + amountEur);
    }
    return Array.from(map.entries())
      .map(([ticker, totalEur]) => ({ ticker, name: companyByTicker.get(ticker)?.name || ticker, totalEur }))
      .sort((a, b) => b.totalEur - a.totalEur);
  }, [dividends, eurUsd, companyByTicker]);

  const sectorAllocation = useMemo(() => computeSectorAllocation(positions, companies), [positions, companies]);

  // ── KPIs (from daily snapshots — accumulate over time) ─────────────────────

  const mwr = useMemo(
    () => computeMWR(cashEntries, cashMemberEntries, totalPortfolioEur, eurUsd),
    [cashEntries, cashMemberEntries, totalPortfolioEur, eurUsd]
  );

  const alignedReturns = useMemo(
    () => computeAlignedReturns(snapshots, cashEntries, eurUsd),
    [snapshots, cashEntries, eurUsd]
  );

  const twr = useMemo(() => computeTWR(alignedReturns.portfolioReturns), [alignedReturns]);
  const volatility = useMemo(() => computeVolatility(alignedReturns.portfolioReturns), [alignedReturns]);
  const cumulativeIndex = useMemo(() => computeCumulativeIndex(alignedReturns.portfolioReturns), [alignedReturns]);
  const maxDrawdown = useMemo(() => computeMaxDrawdown(cumulativeIndex), [cumulativeIndex]);
  const beta = useMemo(
    () => computeBeta(alignedReturns.portfolioReturns, alignedReturns.benchmarkReturns),
    [alignedReturns]
  );

  const sharpe = useMemo(() => {
    if (twr === null || snapshots.length < 2) return null;
    const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const days = (new Date(sorted[sorted.length - 1].snapshot_date).getTime() - new Date(sorted[0].snapshot_date).getTime()) / (1000 * 60 * 60 * 24);
    const annualReturn = annualizeReturn(twr, days);
    return computeSharpe(annualReturn, volatility);
  }, [twr, volatility, snapshots]);

  // ── Loading / error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2">
          <p className="text-sm font-medium text-destructive">Erro ao carregar portfolio</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
              <span className="rounded bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">v2 · Beta</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              EUR/USD {eurUsd.toFixed(4)}
              {pricesLoading && <span className="ml-2 animate-pulse">· A atualizar preços…</span>}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 px-2"
            onClick={() => doFetchPrices(transactions, dividends)} disabled={pricesLoading} title="Refresh de preços">
            {pricesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <SummaryCards
          totalPortfolioEur={totalPortfolioEur}
          totalDepositedEur={totalDepositedEur}
          portfolioGainLossEur={portfolioGainLossEur}
          portfolioGainLossPct={portfolioGainLossPct}
          memberValueBreakdown={memberValueBreakdown}
          totalCashEur={totalCashEur}
          cashByBroker={cashByBroker}
          eurUsd={eurUsd}
          investedCurrentEur={totals.currentEur}
          investedCostEur={totals.basisEur}
          top5ByValue={top5ByValue}
          stockReturnEur={totals.stockEur}
          stockReturnPct={totals.stockPct}
          fxNeutralEur={fxNeutralTotal}
          fxEffectEur={fxEffect}
          top5ByReturn={top5ByReturn}
          totalDividendsEur={totals.divEur}
          dividendsByCompany={dividendsByCompany}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InvestorPanel members={memberPanelData} />
          <KpiPanel
            mwr={mwr}
            twr={twr}
            volatility={volatility}
            maxDrawdown={maxDrawdown}
            sharpe={sharpe}
            beta={beta}
            snapshotCount={snapshots.length}
            sectorAllocation={sectorAllocation}
          />
        </div>

        <PositionsTable
          positions={positions}
          members={members}
          cashEntries={cashEntries}
          cashMemberEntries={cashMemberEntries}
          companyByTicker={companyByTicker}
          companyNotesMap={companyNotesMap}
          allTransactions={transactions}
          allDividends={dividends}
        />
      </div>
    </AppLayout>
  );
}
