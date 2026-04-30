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
  notes: string | null;
  created_at: string;
}

export interface Position {
  ticker: string;
  company_name: string | null;
  currency: string;
  current_qty: number;
  wac: number;             // weighted avg cost in original currency
  current_price: number | null;

  // Cost basis used for % calculations (all buys ever, in EUR)
  basis_eur: number;
  // Current cost of open shares (in EUR)
  invested_eur: number;
  // Current market value of open shares (in EUR)
  current_value_eur: number;

  // Stock P&L (realized + unrealized), in EUR
  stock_return_eur: number;
  realized_stock_eur: number;
  unrealized_stock_eur: number;
  stock_return_pct: number;

  // Dividends received (in EUR)
  dividend_return_eur: number;
  dividend_return_pct: number;

  // Total
  total_return_eur: number;
  total_return_pct: number;

  transactions: PortfolioTransaction[];
  dividends: PortfolioDividend[];
}

function toEur(amount: number, currency: string, eurUsd: number): number {
  if (!isFinite(eurUsd) || eurUsd <= 0) return amount; // fallback: no conversion
  if (currency === 'EUR') return amount;
  // Treat everything non-EUR as USD for now
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

    // Currency: use last buy's currency, fallback USD
    const currency = buys.length > 0 ? buys[buys.length - 1].currency : 'USD';

    // Weighted average cost across all buys
    const total_buy_cost = buys.reduce((s, t) => s + t.price_per_share * t.quantity, 0);
    const wac = total_buy_qty > 0 ? total_buy_cost / total_buy_qty : 0;

    // Cost basis: total capital deployed (used for % denominator)
    const basis_eur = toEur(total_buy_cost, currency, eurUsd);

    // Current exposure (open position cost)
    const invested = wac * current_qty;
    const invested_eur = toEur(invested, currency, eurUsd);

    // Current market value
    const current_price = prices.get(ticker.toUpperCase()) ?? null;
    const current_value = current_price !== null ? current_price * current_qty : invested;
    const current_value_eur = toEur(current_value, currency, eurUsd);

    // Realized P&L from sells (sell_price vs WAC)
    const realized_stock = sells.reduce((s, t) => s + (t.price_per_share - wac) * t.quantity, 0);
    const realized_stock_eur = toEur(realized_stock, currency, eurUsd);

    // Unrealized P&L from open position
    const unrealized_stock = current_price !== null ? (current_price - wac) * current_qty : 0;
    const unrealized_stock_eur = toEur(unrealized_stock, currency, eurUsd);

    const stock_return_eur = realized_stock_eur + unrealized_stock_eur;
    const stock_return_pct = basis_eur > 0 ? (stock_return_eur / basis_eur) * 100 : 0;

    // Dividends
    const total_dividends = divs.reduce((s, d) => s + d.amount_per_share * d.quantity, 0);
    const dividend_return_eur = toEur(total_dividends, currency, eurUsd);
    const dividend_return_pct = basis_eur > 0 ? (dividend_return_eur / basis_eur) * 100 : 0;

    // Total
    const total_return_eur = stock_return_eur + dividend_return_eur;
    const total_return_pct = basis_eur > 0 ? (total_return_eur / basis_eur) * 100 : 0;

    positions.push({
      ticker,
      company_name: companyNames.get(ticker.toUpperCase()) ?? null,
      currency,
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

  // Sort: open positions first (by invested desc), then closed
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

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('portfolio_transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteDividend(id: string): Promise<void> {
  const { error } = await supabase.from('portfolio_dividends').delete().eq('id', id);
  if (error) throw error;
}
