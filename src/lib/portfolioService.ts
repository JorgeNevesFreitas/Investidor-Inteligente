import { supabase } from "@/integrations/supabase/client";

export interface PortfolioTransaction {
  id: string;
  ticker: string;
  company_id: string | null;
  type: 'buy' | 'sell';
  date: string;
  price_per_share: number;
  quantity: number;
  currency: string;
  fees: number;
  broker: string;
  notes: string | null;
  created_at: string;
}

export interface PortfolioDividend {
  id: string;
  ticker: string;
  company_id: string | null;
  date: string;
  amount_per_share: number;
  quantity: number;
  currency: string;
  broker: string;
  notes: string | null;
  created_at: string;
}

export interface PortfolioMember {
  id: string;
  name: string;
  created_at: string;
}

export interface PortfolioCash {
  id: string;
  date: string;
  type: 'deposit' | 'withdrawal' | 'dividend' | 'buy' | 'sell';
  ticker: string | null;
  amount: number;
  currency: 'EUR' | 'USD';
  broker: string;
  notes: string | null;
  created_at: string;
}

export interface PortfolioCashMember {
  id: string;
  cash_id: string;
  member_id: string;
  amount: number;
  percentage: number;
}

export interface PortfolioMemberSnapshotValue {
  value_eur: number;
  invested_eur: number;
  cash_eur: number;
}

export interface PortfolioDailySnapshot {
  id: string;
  snapshot_date: string;
  total_value_eur: number;
  total_invested_eur: number;
  total_cash_eur: number;
  eur_usd_rate: number | null;
  benchmark_ticker: string;
  benchmark_close: number | null;
  member_values: Record<string, PortfolioMemberSnapshotValue>;
  created_at: string;
}

export interface Position {
  ticker: string;
  company_name: string | null;
  currency: string;
  broker: string | null;
  current_qty: number;
  wac: number;
  current_price: number | null;

  basis_eur: number;
  invested_eur: number;
  current_value_eur: number;

  stock_return_eur: number;
  realized_stock_eur: number;
  unrealized_stock_eur: number;
  stock_return_pct: number;

  dividend_return_eur: number;
  dividend_return_pct: number;

  total_return_eur: number;
  total_return_pct: number;

  transactions: PortfolioTransaction[];
  dividends: PortfolioDividend[];
}

function toEur(amount: number, currency: string, eurUsd: number): number {
  if (!isFinite(eurUsd) || eurUsd <= 0) return amount;
  if (currency === 'EUR') return amount;
  return amount / eurUsd;
}

export function computePositions(
  transactions: PortfolioTransaction[],
  dividends: PortfolioDividend[],
  prices: Map<string, number>,
  companyNames: Map<string, string>,
  eurUsd: number,
): Position[] {
  const tickers = new Set([
    ...transactions.map(t => t.ticker),
    ...dividends.map(d => d.ticker),
  ]);

  const positions: Position[] = [];

  for (const ticker of tickers) {
    const txns = transactions
      .filter(t => t.ticker === ticker)
      .sort((a, b) => a.date.localeCompare(b.date));
    const divs = dividends
      .filter(d => d.ticker === ticker)
      .sort((a, b) => a.date.localeCompare(b.date));

    const buys = txns.filter(t => t.type === 'buy');
    const sells = txns.filter(t => t.type === 'sell');

    const total_buy_qty = buys.reduce((s, t) => s + t.quantity, 0);
    const total_sell_qty = sells.reduce((s, t) => s + t.quantity, 0);
    const current_qty = Math.max(0, total_buy_qty - total_sell_qty);

    const currency = buys.length > 0 ? buys[buys.length - 1].currency : 'USD';
    const broker = buys.length > 0 ? buys[buys.length - 1].broker : null;

    const total_buy_cost = buys.reduce((s, t) => s + t.price_per_share * t.quantity, 0);
    const wac = total_buy_qty > 0 ? total_buy_cost / total_buy_qty : 0;

    const basis_eur = toEur(total_buy_cost, currency, eurUsd);
    const invested = wac * current_qty;
    const invested_eur = toEur(invested, currency, eurUsd);

    const current_price = prices.get(ticker.toUpperCase()) ?? null;
    const current_value = current_price !== null ? current_price * current_qty : invested;
    const current_value_eur = toEur(current_value, currency, eurUsd);

    const realized_stock = sells.reduce((s, t) => s + (t.price_per_share - wac) * t.quantity, 0);
    const realized_stock_eur = toEur(realized_stock, currency, eurUsd);

    const unrealized_stock = current_price !== null ? (current_price - wac) * current_qty : 0;
    const unrealized_stock_eur = toEur(unrealized_stock, currency, eurUsd);

    const stock_return_eur = realized_stock_eur + unrealized_stock_eur;
    const stock_return_pct = basis_eur > 0 ? (stock_return_eur / basis_eur) * 100 : 0;

    const total_dividends = divs.reduce((s, d) => s + d.amount_per_share * d.quantity, 0);
    const dividend_return_eur = toEur(total_dividends, currency, eurUsd);
    const dividend_return_pct = basis_eur > 0 ? (dividend_return_eur / basis_eur) * 100 : 0;

    const total_return_eur = stock_return_eur + dividend_return_eur;
    const total_return_pct = basis_eur > 0 ? (total_return_eur / basis_eur) * 100 : 0;

    positions.push({
      ticker,
      company_name: companyNames.get(ticker.toUpperCase()) ?? null,
      currency,
      broker,
      current_qty,
      wac,
      current_price,
      basis_eur,
      invested_eur,
      current_value_eur,
      stock_return_eur,
      realized_stock_eur,
      unrealized_stock_eur,
      stock_return_pct,
      dividend_return_eur,
      dividend_return_pct,
      total_return_eur,
      total_return_pct,
      transactions: txns,
      dividends: divs,
    });
  }

  return positions.sort((a, b) => {
    if (a.current_qty > 0 && b.current_qty === 0) return -1;
    if (a.current_qty === 0 && b.current_qty > 0) return 1;
    return b.invested_eur - a.invested_eur;
  });
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

export async function fetchTransactions(): Promise<PortfolioTransaction[]> {
  const { data, error } = await supabase
    .from('portfolio_transactions')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []) as PortfolioTransaction[];
}

export async function fetchDividends(): Promise<PortfolioDividend[]> {
  const { data, error } = await supabase
    .from('portfolio_dividends')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []) as PortfolioDividend[];
}

export async function fetchMembers(): Promise<PortfolioMember[]> {
  const { data, error } = await supabase
    .from('portfolio_members')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data || []) as PortfolioMember[];
}

export async function fetchCash(): Promise<PortfolioCash[]> {
  const { data, error } = await supabase
    .from('portfolio_cash')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []) as PortfolioCash[];
}

export async function fetchCashMembers(): Promise<PortfolioCashMember[]> {
  const { data, error } = await supabase
    .from('portfolio_cash_members')
    .select('*');
  if (error) throw error;
  return (data || []) as PortfolioCashMember[];
}

export async function fetchDailySnapshots(): Promise<PortfolioDailySnapshot[]> {
  const { data, error } = await supabase
    .from('portfolio_daily_snapshot')
    .select('*')
    .order('snapshot_date', { ascending: true });
  if (error) throw error;
  return (data || []) as PortfolioDailySnapshot[];
}

export async function addTransaction(
  tx: Omit<PortfolioTransaction, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('portfolio_transactions').insert(tx);
  if (error) throw error;
}

export async function addDividend(
  div: Omit<PortfolioDividend, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('portfolio_dividends').insert(div);
  if (error) throw error;
}

export async function addCashEntryWithMembers(
  entry: Omit<PortfolioCash, 'id' | 'created_at'>,
  memberSplits: { member_id: string; amount: number; percentage: number }[]
): Promise<void> {
  const { data, error } = await supabase
    .from('portfolio_cash')
    .insert(entry)
    .select('id')
    .single();
  if (error) throw error;
  if (memberSplits.length > 0) {
    const { error: memberError } = await supabase
      .from('portfolio_cash_members')
      .insert(memberSplits.map(s => ({ ...s, cash_id: data.id })));
    if (memberError) throw memberError;
  }
}

// Deletes the portfolio_cash entry (if any) that was created alongside a buy/sell/dividend
// when it was originally registered, so liquidity reverts correctly when the transaction or
// dividend is removed. There's no FK linking portfolio_cash back to its transaction/dividend,
// so the match is by the same fields the "Registar transação" dialog used to create it
// (ticker, type, broker, currency, date, amount) — the same identifying fields a duplicate
// entry would share, so at most one matching row is removed even if an exact duplicate exists.
async function deleteMatchingCashEntry(match: {
  ticker: string; type: 'buy' | 'sell' | 'dividend'; broker: string; currency: string; date: string; amount: number;
}): Promise<void> {
  const { data: candidates, error } = await supabase
    .from('portfolio_cash')
    .select('id, amount')
    .eq('ticker', match.ticker)
    .eq('type', match.type)
    .eq('broker', match.broker)
    .eq('currency', match.currency)
    .eq('date', match.date);
  if (error) throw error;

  const cashEntry = (candidates || []).find(c => Math.abs(c.amount - match.amount) < 0.01);
  if (!cashEntry) return;

  const { error: deleteError } = await supabase.from('portfolio_cash').delete().eq('id', cashEntry.id);
  if (deleteError) throw deleteError;
}

export async function deleteTransaction(tx: PortfolioTransaction): Promise<void> {
  // buy debits liquidity (negative cash amount), sell credits it (positive) — see addTransaction.
  const cashAmount = tx.type === 'buy'
    ? -(tx.price_per_share * tx.quantity)
    : tx.price_per_share * tx.quantity;
  await deleteMatchingCashEntry({
    ticker: tx.ticker, type: tx.type, broker: tx.broker, currency: tx.currency, date: tx.date, amount: cashAmount,
  });

  const { error } = await supabase.from('portfolio_transactions').delete().eq('id', tx.id);
  if (error) throw error;
}

export async function deleteDividend(div: PortfolioDividend): Promise<void> {
  const cashAmount = div.amount_per_share * div.quantity;
  await deleteMatchingCashEntry({
    ticker: div.ticker, type: 'dividend', broker: div.broker, currency: div.currency, date: div.date, amount: cashAmount,
  });

  const { error } = await supabase.from('portfolio_dividends').delete().eq('id', div.id);
  if (error) throw error;
}

export async function deleteCashEntry(id: string): Promise<void> {
  const { error } = await supabase.from('portfolio_cash').delete().eq('id', id);
  if (error) throw error;
}
