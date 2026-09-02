import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BENCHMARK_TICKER = '^GSPC';

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

interface Transaction {
  ticker: string;
  type: 'buy' | 'sell';
  price_per_share: number;
  quantity: number;
  currency: string;
}

interface CashEntry {
  id: string;
  type: 'deposit' | 'withdrawal' | 'dividend' | 'buy' | 'sell';
  ticker: string | null;
  amount: number;
  currency: 'EUR' | 'USD';
  broker: string;
}

interface CashMember {
  cash_id: string;
  member_id: string;
  amount: number;
}

interface Member {
  id: string;
}

async function fetchPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const resp = await fetch(url, { headers: YF_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

function toEur(amount: number, currency: string, eurUsd: number): number {
  if (currency === 'EUR') return amount;
  if (!eurUsd || eurUsd <= 0) return amount;
  return amount / eurUsd;
}

// Minimal re-implementation of computePositions (src/lib/portfolioService.ts) — only what's
// needed for a total current value per ticker. Kept self-contained, like the other edge functions.
function computeCurrentQtyAndWac(transactions: Transaction[]): { current_qty: number; wac: number; currency: string } {
  const buys = transactions.filter(t => t.type === 'buy');
  const sells = transactions.filter(t => t.type === 'sell');
  const total_buy_qty = buys.reduce((s, t) => s + t.quantity, 0);
  const total_sell_qty = sells.reduce((s, t) => s + t.quantity, 0);
  const current_qty = Math.max(0, total_buy_qty - total_sell_qty);
  const total_buy_cost = buys.reduce((s, t) => s + t.price_per_share * t.quantity, 0);
  const wac = total_buy_qty > 0 ? total_buy_cost / total_buy_qty : 0;
  const currency = buys.length > 0 ? buys[buys.length - 1].currency : 'USD';
  return { current_qty, wac, currency };
}

// Adapted copies of Portfolio.tsx's member-proportion helpers.
function getMemberCashProportions(
  cashEntries: CashEntry[], cashMemberEntries: CashMember[], members: Member[], broker: string, currency: string,
): Map<string, number> {
  const relevantIds = new Set(cashEntries.filter(e => e.broker === broker && e.currency === currency).map(e => e.id));
  const balances = new Map<string, number>(members.map(m => [m.id, 0]));
  for (const cm of cashMemberEntries) {
    if (relevantIds.has(cm.cash_id)) balances.set(cm.member_id, (balances.get(cm.member_id) ?? 0) + cm.amount);
  }
  const total = Array.from(balances.values()).filter(v => v > 0).reduce((s, v) => s + v, 0);
  const result = new Map<string, number>();
  if (total <= 0) {
    for (const m of members) result.set(m.id, 1 / members.length);
  } else {
    for (const m of members) result.set(m.id, Math.max(0, balances.get(m.id) ?? 0) / total);
  }
  return result;
}

function getMemberTickerProportions(
  cashEntries: CashEntry[], cashMemberEntries: CashMember[], members: Member[], ticker: string,
): Map<string, number> {
  const buyIds = new Set(cashEntries.filter(e => e.type === 'buy' && e.ticker === ticker).map(e => e.id));
  const result = new Map<string, number>();
  if (buyIds.size === 0) {
    for (const m of members) result.set(m.id, 1 / members.length);
    return result;
  }
  const memberBuys = new Map<string, number>(members.map(m => [m.id, 0]));
  for (const cm of cashMemberEntries) {
    if (buyIds.has(cm.cash_id)) memberBuys.set(cm.member_id, (memberBuys.get(cm.member_id) ?? 0) + Math.abs(cm.amount));
  }
  const total = Array.from(memberBuys.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) {
    for (const m of members) result.set(m.id, 1 / members.length);
  } else {
    for (const m of members) result.set(m.id, (memberBuys.get(m.id) ?? 0) / total);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const [{ data: transactions }, { data: cashEntries }, { data: cashMembers }, { data: members }] = await Promise.all([
      supabase.from('portfolio_transactions').select('ticker, type, price_per_share, quantity, currency'),
      supabase.from('portfolio_cash').select('id, type, ticker, amount, currency, broker'),
      supabase.from('portfolio_cash_members').select('cash_id, member_id, amount'),
      supabase.from('portfolio_members').select('id'),
    ]);

    const txns: Transaction[] = transactions ?? [];
    const cash: CashEntry[] = cashEntries ?? [];
    const cashMs: CashMember[] = cashMembers ?? [];
    const membersList: Member[] = members ?? [];

    // EUR/USD rate
    let eurUsd = 1.09;
    const eurPrice = await fetchPrice('EURUSD=X');
    if (eurPrice) eurUsd = eurPrice;

    // Current price per unique ticker (small delay between calls to avoid rate limiting)
    const tickers = [...new Set(txns.map(t => t.ticker.toUpperCase()))];
    const priceByTicker = new Map<string, number>();
    for (const ticker of tickers) {
      await new Promise(r => setTimeout(r, 200));
      const price = await fetchPrice(ticker);
      if (price) priceByTicker.set(ticker, price);
    }

    // Benchmark close
    const benchmarkClose = await fetchPrice(BENCHMARK_TICKER);

    // Positions: current value per ticker (EUR), plus member attribution
    const memberInvestedEur = new Map<string, number>(membersList.map(m => [m.id, 0]));
    let totalInvestedEur = 0;

    for (const ticker of tickers) {
      const tickerTxns = txns.filter(t => t.ticker.toUpperCase() === ticker);
      const { current_qty, wac, currency } = computeCurrentQtyAndWac(tickerTxns);
      if (current_qty <= 0) continue;

      const price = priceByTicker.get(ticker) ?? wac;
      const currentValue = price * current_qty;
      const currentValueEur = toEur(currentValue, currency, eurUsd);
      totalInvestedEur += currentValueEur;

      const proportions = getMemberTickerProportions(cash, cashMs, membersList, ticker);
      for (const [memberId, prop] of proportions) {
        memberInvestedEur.set(memberId, (memberInvestedEur.get(memberId) ?? 0) + currentValueEur * prop);
      }
    }

    // Cash: total per broker+currency, plus member attribution
    const cashByBrokerCurrency = new Map<string, number>();
    for (const e of cash) {
      const key = `${e.broker}::${e.currency}`;
      cashByBrokerCurrency.set(key, (cashByBrokerCurrency.get(key) ?? 0) + e.amount);
    }

    let totalCashEur = 0;
    const memberCashEur = new Map<string, number>(membersList.map(m => [m.id, 0]));

    for (const [key, amount] of cashByBrokerCurrency) {
      const [broker, currency] = key.split('::');
      const amountEur = toEur(amount, currency, eurUsd);
      totalCashEur += amountEur;

      const proportions = getMemberCashProportions(cash, cashMs, membersList, broker, currency);
      for (const [memberId, prop] of proportions) {
        memberCashEur.set(memberId, (memberCashEur.get(memberId) ?? 0) + amountEur * prop);
      }
    }

    const totalValueEur = totalInvestedEur + totalCashEur;

    const memberValues: Record<string, { value_eur: number; invested_eur: number; cash_eur: number }> = {};
    for (const m of membersList) {
      const investedEur = memberInvestedEur.get(m.id) ?? 0;
      const cashEurValue = memberCashEur.get(m.id) ?? 0;
      memberValues[m.id] = {
        value_eur: investedEur + cashEurValue,
        invested_eur: investedEur,
        cash_eur: cashEurValue,
      };
    }

    const snapshotDate = new Date().toISOString().slice(0, 10);

    const { error: upsertError } = await supabase.from('portfolio_daily_snapshot').upsert({
      snapshot_date: snapshotDate,
      total_value_eur: totalValueEur,
      total_invested_eur: totalInvestedEur,
      total_cash_eur: totalCashEur,
      eur_usd_rate: eurUsd,
      benchmark_ticker: BENCHMARK_TICKER,
      benchmark_close: benchmarkClose,
      member_values: memberValues,
    }, { onConflict: 'snapshot_date' });

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({
      success: true,
      snapshot_date: snapshotDate,
      total_value_eur: totalValueEur,
      total_invested_eur: totalInvestedEur,
      total_cash_eur: totalCashEur,
      benchmark_close: benchmarkClose,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('portfolio-snapshot error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
