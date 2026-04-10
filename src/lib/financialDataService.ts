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

// Convert DB financial data to the FinancialYear interface used by existing components
export function dbFinancialsToFinancialYears(financials: DBFinancialYear[]): FinancialYear[] {
  const years: FinancialYear[] = [];

  for (const fy of financials) {
    const items = new Map<string, number>();
    for (const li of fy.financial_line_items) {
      if (li.normalized_value !== null) {
        items.set(li.normalized_key, li.normalized_value);
      }
    }

    const get = (key: string) => items.get(key) ?? 0;
    
    const revenue = get('revenue');
    const grossProfit = items.has('gross_profit') ? get('gross_profit') : revenue - get('cost_of_revenue');
    const operatingIncome = get('operating_income');
    const netIncome = get('net_income');
    const sharesOutstanding = get('shares_outstanding');
    const eps = items.has('eps_diluted') ? get('eps_diluted') : (items.has('eps_basic') ? get('eps_basic') : (sharesOutstanding > 0 ? netIncome / sharesOutstanding : 0));
    const fcf = items.has('free_cash_flow') ? get('free_cash_flow') : (get('operating_cash_flow') - Math.abs(get('capital_expenditures')));
    const equity = get('shareholders_equity');
    const totalDebt = get('long_term_debt') + get('short_term_debt');
    const dividendsTotal = Math.abs(get('dividends_paid'));

    // Detect if values are in raw dollars (SEC XBRL) vs already in millions (StockAnalysis)
    // SEC data: revenue > 1 billion → it's in raw USD, convert to millions
    const isSECScale = Math.abs(revenue) > 1e9;
    const toM = (v: number) => isSECScale ? v / 1e6 : v;

    // Shares: SEC gives individual count, convert to millions
    const sharesM = sharesOutstanding > 1e9 ? sharesOutstanding / 1e6 : sharesOutstanding;
    
    // Book value per share: SEC equity / shares (both raw), or SA provides directly
    const bookValuePerShare = items.has('book_value_per_share') 
      ? get('book_value_per_share') 
      : (sharesOutstanding > 0 ? equity / sharesOutstanding : 0);

    // Dividends per share
    const dividendsPerShare = sharesOutstanding > 0 ? dividendsTotal / sharesOutstanding : 0;

    years.push({
      year: fy.fiscal_year,
      revenue: toM(revenue),
      revenueGrowth: null,
      grossProfit: toM(grossProfit),
      grossMargin: revenue ? (grossProfit / revenue) * 100 : 0,
      operatingIncome: toM(operatingIncome),
      ebitGrowth: null,
      netIncome: toM(netIncome),
      netIncomeGrowth: null,
      eps,
      epsGrowth: null,
      fcf: toM(fcf),
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
  const { data, error } = await supabase.functions.invoke('company-data', {
    body: null,
    method: 'GET',
    headers: {},
  });

  // Since we can't pass query params easily through invoke, use the POST method
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

export async function importFromSEC(ticker: string): Promise<{ success: boolean; years_imported?: number[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke('sec-import', {
    body: { ticker },
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return data;
}

export async function importFromStockAnalysis(params: {
  ticker?: string;
  url?: string;
  company_name?: string;
  exchange?: string;
}): Promise<{ success: boolean; years_imported?: number[]; error?: string; company_id?: string }> {
  const { data, error } = await supabase.functions.invoke('stockanalysis-import', {
    body: params,
  });

  if (error) {
    return { success: false, error: error.message };
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
