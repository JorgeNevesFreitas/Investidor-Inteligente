import { supabase } from "@/integrations/supabase/client";
import { FinancialYear, Company } from "@/lib/mockData";

// Types for DB data
export interface DBCompany {
  id: string;
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  currency: string | null;
  country: string | null;
  region_type: 'US' | 'NON_US';
  cik: string | null;
  sec_enabled: boolean | null;
  stockanalysis_url: string | null;
  primary_data_source: string | null;
  current_price: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  fiscal_year_end_month: number | null;
  last_imported_at: string | null;
  last_refreshed_at: string | null;
}

export interface DBFinancialYear {
  id: string;
  company_id: string;
  fiscal_year: number;
  source_type: string | null;
  source_url: string | null;
  import_method: string | null;
  data_status: string | null;
  financial_line_items: DBLineItem[];
}

export interface DBLineItem {
  normalized_key: string;
  normalized_value: number | null;
  statement_type: string;
  source_type: string | null;
  confidence_score: number | null;
}

export interface ImportJob {
  id: string;
  job_type: string;
  source_type: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  years_imported: number[] | null;
  log_summary: string | null;
  error_details: string | null;
}

export interface CompanyData {
  company: DBCompany | null;
  financials: DBFinancialYear[];
  import_history: ImportJob[];
}

// Keys that are already per-share — never divide by 1e6 regardless of source
const PER_SHARE_KEYS = new Set(['eps_diluted', 'eps_basic', 'book_value_per_share']);

// Convert DB financial data to the FinancialYear interface used by existing components
export function dbFinancialsToFinancialYears(financials: DBFinancialYear[]): FinancialYear[] {
  const years: FinancialYear[] = [];

  for (const fy of financials) {
    // Store raw value + source_type per key so we can normalise each item independently.
    // This prevents scale errors when a year has mixed SEC (raw USD) and StockAnalysis
    // (already-in-millions) data — e.g. revenue from SEC but FCF from a prior SA import.
    const itemMeta = new Map<string, { value: number; source_type: string | null }>();
    for (const li of fy.financial_line_items) {
      if (li.normalized_value !== null) {
        itemMeta.set(li.normalized_key, { value: li.normalized_value, source_type: li.source_type });
      }
    }

    // Normalise a value to millions (or USD/share for per-share keys) based on its own source.
    // SEC XBRL: monetary values are raw USD → ÷1e6; shares are raw count → ÷1e6; per-share unchanged.
    // StockAnalysis / other: monetary values already in millions; shares already in millions; per-share unchanged.
    const norm = (key: string, meta: { value: number; source_type: string | null }): number => {
      if (PER_SHARE_KEYS.has(key)) return meta.value;
      if (meta.source_type === 'SEC_XBRL') return meta.value / 1e6;
      return meta.value;
    };

    const get = (key: string): number => {
      const meta = itemMeta.get(key);
      return meta !== undefined ? norm(key, meta) : 0;
    };

    const has = (key: string) => itemMeta.has(key);

    const revenue        = get('revenue');
    const costOfRevenue  = get('cost_of_revenue');
    const grossProfit    = has('gross_profit') ? get('gross_profit') : revenue - costOfRevenue;
    const operatingIncome = get('operating_income');
    const netIncome      = get('net_income');
    const sharesRaw      = get('shares_outstanding'); // always in millions after norm()
    // Derive eps from available per-share keys first so we can back-calculate shares if needed
    const epsRaw         = has('eps_diluted') ? get('eps_diluted')
                         : has('eps_basic')   ? get('eps_basic')
                         : 0;
    // If shares_outstanding is missing but eps and net_income are present, derive it (e.g. KO from SEC)
    const sharesM        = sharesRaw > 0 ? sharesRaw
                         : (epsRaw > 0 && netIncome > 0) ? netIncome / epsRaw
                         : 0;
    const eps            = epsRaw > 0 ? epsRaw
                         : sharesM > 0 ? netIncome / sharesM
                         : 0;
    const ocf            = get('operating_cash_flow');
    const capex          = get('capital_expenditures');
    const fcf            = has('free_cash_flow') ? get('free_cash_flow') : ocf - Math.abs(capex);
    const equity         = get('shareholders_equity');
    const totalDebt      = get('long_term_debt') + get('short_term_debt');
    const dividendsTotal = Math.abs(get('dividends_paid'));

    // Book value per share
    const bookValuePerShare = has('book_value_per_share')
      ? get('book_value_per_share')
      : sharesM > 0 ? equity / sharesM : 0;

    // Dividends per share: dividendsTotal is in millions, sharesM is in millions → result in USD/share
    const dividendsPerShare = sharesM > 0 ? dividendsTotal / sharesM : 0;

    const depAmort = has('depreciation_amortization') ? get('depreciation_amortization') : null;
    const intExp   = has('interest_expense')           ? get('interest_expense')           : null;
    const depreciationToGP = (depAmort !== null && grossProfit > 0) ? (depAmort / grossProfit) * 100 : null;
    const interestToGP     = (intExp   !== null && grossProfit > 0) ? (intExp   / grossProfit) * 100 : null;

    years.push({
      year: fy.fiscal_year,
      revenue,
      revenueGrowth: null,
      grossProfit,
      grossMargin: revenue ? (grossProfit / revenue) * 100 : 0,
      operatingIncome,
      ebitGrowth: null,
      netIncome,
      netIncomeGrowth: null,
      eps,
      epsGrowth: null,
      fcf,
      fcfGrowth: null,
      roe: equity ? (netIncome / equity) * 100 : 0,
      netMargin: revenue ? (netIncome / revenue) * 100 : 0,
      operatingMargin: revenue ? (operatingIncome / revenue) * 100 : 0,
      sgaToRevenue: revenue ? (get('sga') / revenue) * 100 : 0,
      rdToRevenue: revenue ? (get('rd') / revenue) * 100 : 0,
      debtToEquity: equity ? totalDebt / equity : 0,
      currentRatio: get('current_liabilities') ? get('current_assets') / get('current_liabilities') : 0,
      bookValuePerShare,
      bookValueGrowth: null,
      sharesOutstanding: sharesM,
      dividends: dividendsPerShare,
      payoutRatio: netIncome ? (dividendsTotal / netIncome) * 100 : 0,
      depreciationToGP,
      interestToGP,
    });
  }

  // Sort by year and calculate growth rates
  years.sort((a, b) => a.year - b.year);
  for (let i = 1; i < years.length; i++) {
    const prev = years[i - 1];
    const curr = years[i];
    if (prev.revenue) curr.revenueGrowth = ((curr.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100;
    if (prev.netIncome) curr.netIncomeGrowth = ((curr.netIncome - prev.netIncome) / Math.abs(prev.netIncome)) * 100;
    if (prev.eps) curr.epsGrowth = ((curr.eps - prev.eps) / Math.abs(prev.eps)) * 100;
    if (prev.fcf) curr.fcfGrowth = ((curr.fcf - prev.fcf) / Math.abs(prev.fcf)) * 100;
    if (prev.operatingIncome) curr.ebitGrowth = ((curr.operatingIncome - prev.operatingIncome) / Math.abs(prev.operatingIncome)) * 100;
    if (prev.bookValuePerShare) curr.bookValueGrowth = ((curr.bookValuePerShare - prev.bookValuePerShare) / Math.abs(prev.bookValuePerShare)) * 100;
  }

  return years;
}

// Convert DB company to the Company interface
export function dbToCompany(dbCompany: DBCompany, financials: FinancialYear[]): Company {
  return {
    ticker: dbCompany.ticker,
    name: dbCompany.name,
    exchange: dbCompany.exchange || '',
    sector: dbCompany.sector || '',
    currency: dbCompany.currency || 'USD',
    currentPrice: dbCompany.current_price || 0,
    marketCap: dbCompany.market_cap || 0,
    sharesOutstanding: financials.length > 0 ? financials[financials.length - 1].sharesOutstanding : 0,
    pe: dbCompany.pe_ratio || 0,
    financials,
  };
}

// API functions
export async function getCompanyData(ticker: string): Promise<CompanyData> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/company-data?action=get&ticker=${encodeURIComponent(ticker.toUpperCase())}`,
    {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch company data: ${response.status}`);
  }

  const result = await response.json();
  return {
    company: result.company || null,
    financials: result.financials || [],
    import_history: result.import_history || [],
  };
}

export interface ImportResult {
  success: boolean;
  years_imported?: number[];
  years_updated?: number[];
  years_skipped?: number[];
  years_available?: number[];
  missing_years?: number[];
  logs?: string[];
  // Non-fatal issues on an otherwise-successful import (e.g. a statement page that failed
  // to scrape, or a statement type that came back with no extractable data) — surface these
  // so partial/incomplete data isn't mistaken for a clean import.
  warnings?: string[];
  error?: string;
  company_id?: string;
  // When the Edge Function detects the chosen source can't serve this company
  // (e.g. a foreign private issuer filing IFRS 20-F instead of US-GAAP 10-K),
  // it names a better-suited source here so the UI can suggest switching to it.
  suggest_alternative_source?: 'sec' | 'stockanalysis';
}

// supabase-js only sets a generic "Edge Function returned a non-2xx status code"
// message on invoke() errors — the actual error detail our functions return in the
// JSON body (e.g. "No annual financial data found...") is left on error.context,
// the raw Response. Read it back out so users see the real reason, not the generic one.
async function extractFunctionError(error: any): Promise<{ message: string; suggestAlternativeSource?: 'sec' | 'stockanalysis' }> {
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await (typeof context.clone === 'function' ? context.clone() : context).json();
      if (body && typeof body.error === 'string') {
        return { message: body.error, suggestAlternativeSource: body.suggest_alternative_source };
      }
    } catch {
      // Response body wasn't JSON (or already consumed) — fall through to generic message.
    }
  }
  return { message: error?.message || 'Erro desconhecido' };
}

export async function importFromSEC(ticker: string, options?: { specific_year?: number; is_incremental?: boolean }): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke('sec-import', {
    body: { ticker, specific_year: options?.specific_year, is_incremental: options?.is_incremental ?? true },
  });

  if (error) {
    const { message, suggestAlternativeSource } = await extractFunctionError(error);
    return { success: false, error: message, suggest_alternative_source: suggestAlternativeSource };
  }
  return data;
}

export async function importFromStockAnalysis(params: {
  ticker?: string;
  url?: string;
  company_name?: string;
  exchange?: string;
  specific_year?: number;
  is_incremental?: boolean;
}): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke('stockanalysis-import', {
    body: { ...params, is_incremental: params.is_incremental ?? true },
  });

  if (error) {
    const { message, suggestAlternativeSource } = await extractFunctionError(error);
    return { success: false, error: message, suggest_alternative_source: suggestAlternativeSource };
  }
  return data;
}

export async function listCompanies(): Promise<DBCompany[]> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/company-data?action=list`,
    {
      method: 'POST',
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) return [];
  const result = await response.json();
  return result.companies || [];
}
