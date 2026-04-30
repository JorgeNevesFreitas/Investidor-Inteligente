import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Fetch price + exchange from Yahoo Finance chart endpoint
async function fetchChart(ticker: string): Promise<{ price: number; currency: string; exchange: string | null } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const resp = await fetch(url, { headers: YF_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return {
      price: meta.regularMarketPrice,
      currency: meta.currency || 'USD',
      exchange: meta.exchangeName || meta.exchange || null,
    };
  } catch {
    return null;
  }
}

// Fetch sector + fiscal year end month from Yahoo Finance quoteSummary
async function fetchQuoteSummary(ticker: string): Promise<{ sector: string | null; fiscalYearEndMonth: number | null }> {
  try {
    const url = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryProfile,summaryDetail`;
    const resp = await fetch(url, { headers: YF_HEADERS });
    if (!resp.ok) return { sector: null, fiscalYearEndMonth: null };
    const data = await resp.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return { sector: null, fiscalYearEndMonth: null };

    const sector: string | null = result.summaryProfile?.sector || null;

    // fiscalYearEnd can be an integer (1-12) or {raw, fmt:"September"}
    let fiscalYearEndMonth: number | null = null;
    const fye = result.summaryDetail?.fiscalYearEnd;
    if (typeof fye === 'number' && fye >= 1 && fye <= 12) {
      fiscalYearEndMonth = fye;
    } else if (fye?.raw !== undefined) {
      const raw = Number(fye.raw);
      if (raw >= 1 && raw <= 12) {
        fiscalYearEndMonth = raw;
      }
    }
    // Fallback: parse fmt string (e.g. "September")
    if (fiscalYearEndMonth === null && fye?.fmt) {
      const m = MONTH_NAMES[String(fye.fmt).toLowerCase()];
      if (m) fiscalYearEndMonth = m;
    }

    return { sector, fiscalYearEndMonth };
  } catch {
    return { sector: null, fiscalYearEndMonth: null };
  }
}

// Compute fiscal year end month from the end dates stored in financial_line_items.source_reference.
// SEC XBRL imports store the fact's endDate there (e.g. "2024-09-28" → September = 9).
async function computeFiscalYearEndMonth(supabase: ReturnType<typeof createClient>, companyId: string): Promise<number | null> {
  const { data: years } = await supabase
    .from('financial_statement_years')
    .select('id')
    .eq('company_id', companyId);

  if (!years?.length) return null;

  const yearIds = years.map((y: { id: string }) => y.id);

  const { data: items } = await supabase
    .from('financial_line_items')
    .select('source_reference')
    .in('statement_year_id', yearIds)
    .eq('statement_type', 'income_statement')
    .not('source_reference', 'is', null);

  if (!items?.length) return null;

  const monthCounts = new Map<number, number>();
  for (const item of items) {
    const match = (item.source_reference as string | null)?.match(/^\d{4}-(\d{2})-\d{2}$/);
    if (match) {
      const m = parseInt(match[1]);
      if (m >= 1 && m <= 12) monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
    }
  }

  let best: number | null = null;
  let maxCount = 0;
  for (const [m, count] of monthCounts) {
    if (count > maxCount) { maxCount = count; best = m; }
  }
  return best;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);
    const ticker = reqUrl.searchParams.get('ticker')?.toUpperCase();
    const mode = reqUrl.searchParams.get('mode') || 'price';

    if (!ticker) {
      return new Response(JSON.stringify({ success: false, error: 'ticker required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── MODE: full ─────────────────────────────────────────────────────────────
    if (mode === 'full') {
      const chart = await fetchChart(ticker);

      if (!chart || chart.price <= 0) {
        return new Response(JSON.stringify({
          success: false, error: 'Price unavailable', ticker, status: 'unavailable',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { price, currency, exchange: chartExchange } = chart;

      // Load company from DB
      const { data: company } = await supabase
        .from('companies')
        .select('id, exchange, sector, pe_ratio, market_cap, fiscal_year_end_month')
        .eq('ticker', ticker)
        .maybeSingle();

      const needsSector = !company?.sector;
      const needsFye    = !company?.fiscal_year_end_month;

      // Only call quoteSummary when we're missing data (first load or after reset)
      let yfSector: string | null = null;
      let yfFyeMonth: number | null = null;
      if (needsSector || needsFye) {
        const qs = await fetchQuoteSummary(ticker);
        yfSector    = qs.sector;
        yfFyeMonth  = qs.fiscalYearEndMonth;
      }

      const finalSector   = company?.sector || yfSector;
      let   finalExchange = chartExchange || company?.exchange || null;

      // Compute fiscal year end from line items (SEC data has dates in source_reference)
      let fyeMonth: number | null = company?.fiscal_year_end_month ?? null;
      if (fyeMonth === null && company) {
        fyeMonth = await computeFiscalYearEndMonth(supabase, company.id);
      }
      // Last resort: Yahoo Finance
      if (fyeMonth === null) fyeMonth = yfFyeMonth;

      // Compute PE and market cap from stored financials
      let pe: number | null = null;
      let marketCapM: number | null = null;

      if (company) {
        const { data: latestYear } = await supabase
          .from('financial_statement_years')
          .select('id')
          .eq('company_id', company.id)
          .order('fiscal_year', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestYear) {
          const { data: items } = await supabase
            .from('financial_line_items')
            .select('normalized_key, normalized_value, source_type')
            .eq('statement_year_id', latestYear.id)
            .in('normalized_key', ['eps_diluted', 'eps_basic', 'shares_outstanding', 'revenue']);

          const get = (key: string) =>
            items?.find((i: { normalized_key: string }) => i.normalized_key === key)?.normalized_value ?? null;

          const eps    = get('eps_diluted') ?? get('eps_basic');
          const shares = get('shares_outstanding');
          const rev    = get('revenue');

          const isSECScale = rev !== null && Math.abs(rev) > 1e9;

          if (eps !== null && Math.abs(eps) > 0) {
            pe = parseFloat((price / eps).toFixed(2));
            if (pe < 0 || pe > 10000) pe = null;
          }

          if (shares !== null && shares > 0) {
            const sharesM = isSECScale ? shares / 1e6 : shares;
            marketCapM = Math.round(price * sharesM);
          }
        }
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = { current_price: price, currency, last_refreshed_at: now };
      if (pe !== null)            updatePayload.pe_ratio  = pe;
      if (marketCapM !== null)    updatePayload.market_cap = marketCapM;
      if (finalExchange !== null) updatePayload.exchange   = finalExchange;
      if (finalSector !== null)   updatePayload.sector     = finalSector;

      await supabase.from('companies').update(updatePayload).eq('ticker', ticker);
      // Separate update for fiscal_year_end_month — silently ignored if column doesn't exist yet
      if (fyeMonth !== null) {
        await supabase.from('companies').update({ fiscal_year_end_month: fyeMonth }).eq('ticker', ticker);
      }

      return new Response(JSON.stringify({
        success: true, ticker, price, currency, pe, marketCap: marketCapM,
        exchange: finalExchange, sector: finalSector,
        fiscal_year_end_month: fyeMonth,
        timestamp: now, status: 'success',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── MODE: price (30s polling) ───────────────────────────────────────────────
    const chart = await fetchChart(ticker);

    if (!chart || chart.price <= 0) {
      return new Response(JSON.stringify({
        success: false, error: 'Price unavailable', ticker, status: 'unavailable',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase.from('companies')
      .update({ current_price: chart.price, currency: chart.currency })
      .eq('ticker', ticker);

    return new Response(JSON.stringify({
      success: true, ticker, price: chart.price, currency: chart.currency,
      source: 'yahoo_finance', timestamp: new Date().toISOString(), status: 'success',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('market-price error:', error);
    return new Response(JSON.stringify({
      success: false, error: error instanceof Error ? error.message : 'Unknown error', status: 'error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
