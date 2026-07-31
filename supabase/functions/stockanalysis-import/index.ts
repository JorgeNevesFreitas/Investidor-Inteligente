import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function parseNumber(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$%,]/g, '').replace(/\((.+)\)/, '-$1').trim();
  if (cleaned === '-' || cleaned === 'N/A' || cleaned === '' || cleaned === 'n/a') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function extractTableRows(markdown: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  const lines = markdown.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
    if (cells.length >= 2) {
      const label = cells[0].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      rows.set(label, cells.slice(1));
    }
  }
  return rows;
}

function getYearColumns(rows: Map<string, string[]>): { years: number[]; indices: number[] } {
  const fyRow = rows.get('Fiscal Year') || rows.get('Period Ending');
  if (!fyRow) return { years: [], indices: [] };
  const years: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < fyRow.length; i++) {
    const match = fyRow[i].match(/(?:FY\s+)?(\d{4})/);
    if (match) { years.push(parseInt(match[1])); indices.push(i); }
  }
  return { years, indices };
}

// On StockAnalysis's condensed "Financial Highlights" table layout (served for some tickers,
// e.g. foreign filers like Ferrari/RACE, instead of the full itemized statement), each metric
// cell stacks a value row and its "X Growth" row inside the same table cell. Firecrawl's
// markdown conversion collapses that stack with no separator, so the row label comes out as
// e.g. "RevenueRevenue Growth" or "Earnings Per ShareEPS Growth" instead of a clean "Revenue".
// Fall back to a prefix match when the exact label isn't found. The lookahead character check
// tells apart the mangled value row ("RevenueRevenue Growth", no space after the prefix) from
// the separate, legitimate "Revenue Growth" percentage row (space after the prefix) — we must
// only ever match the former.
function findRow(rows: Map<string, string[]>, label: string): string[] | undefined {
  const exact = rows.get(label);
  if (exact) return exact;
  for (const [key, values] of rows.entries()) {
    if (key.length > label.length && key.startsWith(label) && key[label.length] !== ' ') {
      return values;
    }
  }
  return undefined;
}

function getVal(rows: Map<string, string[]>, labels: string[], colIdx: number): number | null {
  for (const label of labels) {
    const row = findRow(rows, label);
    if (row && colIdx < row.length) {
      const v = parseNumber(row[colIdx]);
      if (v !== null) return v;
    }
  }
  return null;
}

// Scrapes a single StockAnalysis page via Firecrawl, retrying on transient failures
// (network errors, rate limits, empty responses) so one flaky page doesn't silently
// zero out an entire statement for the whole import.
async function scrapePageWithRetry(apiKey: string, url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      });
      const data = await response.json();
      const markdown = data.data?.markdown || data.markdown || '';
      if (response.ok && markdown) return markdown;
      console.error(`Scrape attempt ${i + 1}/${retries} failed for ${url}: status=${response.status}`, response.ok ? '(empty markdown)' : data);
    } catch (e) {
      console.error(`Scrape attempt ${i + 1}/${retries} threw for ${url}:`, e);
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, Math.pow(2, i + 1) * 1000));
  }
  return '';
}

const SA_INCOME_MAPPINGS: Record<string, { labels: string[]; statementType: string }> = {
  revenue: { labels: ['Revenue', 'Revenue (Total)'], statementType: 'income_statement' },
  cost_of_revenue: { labels: ['Cost of Revenue'], statementType: 'income_statement' },
  gross_profit: { labels: ['Gross Profit'], statementType: 'income_statement' },
  operating_income: { labels: ['Operating Income', 'Operating Income (EBIT)'], statementType: 'income_statement' },
  net_income: { labels: ['Net Income', 'Net Income to Common'], statementType: 'income_statement' },
  // Some pages only show a single combined EPS figure ("Earnings Per Share") instead of the
  // Basic/Diluted breakdown — fall back to it so eps_diluted (checked first downstream) still
  // gets populated rather than silently staying at 0.
  eps_basic: { labels: ['EPS (Basic)', 'Earnings Per Share'], statementType: 'income_statement' },
  eps_diluted: { labels: ['EPS (Diluted)', 'Earnings Per Share'], statementType: 'income_statement' },
  shares_outstanding: { labels: ['Shares Outstanding (Diluted)', 'Shares Outstanding (Basic)', 'Shares Outstanding'], statementType: 'income_statement' },
  sga: { labels: ['Selling, General & Admin'], statementType: 'income_statement' },
  rd: { labels: ['Research & Development'], statementType: 'income_statement' },
  ebitda: { labels: ['EBITDA'], statementType: 'income_statement' },
  interest_expense: { labels: ['Interest Expense', 'Interest Expense / Income'], statementType: 'income_statement' },
  depreciation_amortization: { labels: ['Depreciation & Amortization'], statementType: 'income_statement' },
};

const SA_BALANCE_MAPPINGS: Record<string, { labels: string[]; statementType: string }> = {
  cash_and_equivalents: { labels: ['Cash & Equivalents', 'Cash & Cash Equivalents'], statementType: 'balance_sheet' },
  current_assets: { labels: ['Total Current Assets'], statementType: 'balance_sheet' },
  total_assets: { labels: ['Total Assets'], statementType: 'balance_sheet' },
  current_liabilities: { labels: ['Total Current Liabilities'], statementType: 'balance_sheet' },
  total_liabilities: { labels: ['Total Liabilities'], statementType: 'balance_sheet' },
  long_term_debt: { labels: ['Long-Term Debt', 'Total Debt'], statementType: 'balance_sheet' },
  short_term_debt: { labels: ['Short-Term Debt'], statementType: 'balance_sheet' },
  shareholders_equity: { labels: ["Shareholders' Equity", 'Total Equity'], statementType: 'balance_sheet' },
  book_value_per_share: { labels: ['Book Value Per Share'], statementType: 'balance_sheet' },
};

const SA_CASHFLOW_MAPPINGS: Record<string, { labels: string[]; statementType: string }> = {
  operating_cash_flow: { labels: ['Operating Cash Flow'], statementType: 'cash_flow' },
  capital_expenditures: { labels: ['Capital Expenditures'], statementType: 'cash_flow' },
  free_cash_flow: { labels: ['Free Cash Flow'], statementType: 'cash_flow' },
  dividends_paid: { labels: ['Dividends Paid'], statementType: 'cash_flow' },
  share_repurchases: { labels: ['Share Repurchases', 'Buybacks'], statementType: 'cash_flow' },
};

function computeChecksumSA(allMappings: Record<string, any>, incomeRows: Map<string, string[]>, balanceRows: Map<string, string[]>, cashFlowRows: Map<string, string[]>, incIdx: number, bsIdx: number, cfIdx: number): string {
  const parts: string[] = [];
  for (const [key, mapping] of Object.entries(allMappings)) {
    let rows: Map<string, string[]>;
    let colIdx: number;
    if (mapping.statementType === 'income_statement') { rows = incomeRows; colIdx = incIdx; }
    else if (mapping.statementType === 'balance_sheet') { rows = balanceRows; colIdx = bsIdx; }
    else { rows = cashFlowRows; colIdx = cfIdx; }
    const val = getVal(rows, mapping.labels, colIdx);
    if (val !== null) parts.push(`${key}:${val}`);
  }
  let hash = 0;
  const str = parts.sort().join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { ticker, url, company_name, exchange, specific_year, is_incremental = true } = await req.json();

    if (!ticker && !url) {
      return new Response(JSON.stringify({ success: false, error: 'Ticker or URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let stockBase: string;
    let effectiveTicker = ticker?.toUpperCase();
    
    if (url) {
      // Accepts both /stocks/{ticker} and /quote/{exchange}/{ticker} URL formats
      const match = url.match(/(https:\/\/stockanalysis\.com\/(?:stocks|quote\/[^/]+)\/[^/]+)/);
      if (!match) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid StockAnalysis URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      stockBase = match[1];
      // Only derive ticker from URL when no explicit ticker was provided
      if (!ticker) {
        const tickerMatch = stockBase.match(/\/([^/]+)$/);
        if (tickerMatch) effectiveTicker = tickerMatch[1].toUpperCase();
      }
    } else {
      // Strip exchange suffix (e.g. MC.PA → mc, VOD.L → vod) — StockAnalysis URLs use only the base ticker
      const baseTicker = ticker.replace(/\.[A-Z0-9]{1,4}$/, '');
      stockBase = `https://stockanalysis.com/stocks/${baseTicker.toLowerCase()}`;
    }

    console.log(`StockAnalysis import for ${effectiveTicker} (incremental=${is_incremental}, specific_year=${specific_year || 'none'})`);

    // Upsert company
    const { data: existingCompany } = await supabase
      .from('companies').select('id, region_type')
      .eq('ticker', effectiveTicker).maybeSingle();

    let companyId: string;
    if (existingCompany) {
      companyId = existingCompany.id;
      await supabase.from('companies').update({
        stockanalysis_url: stockBase,
        primary_data_source: 'STOCKANALYSIS',
        ...(company_name ? { name: company_name } : {}),
        ...(exchange ? { exchange } : {}),
      }).eq('id', companyId);
    } else {
      const { data: newCompany, error: insertErr } = await supabase
        .from('companies').insert({
          ticker: effectiveTicker, name: company_name || effectiveTicker,
          exchange: exchange || null, region_type: 'NON_US' as const,
          stockanalysis_url: stockBase, primary_data_source: 'STOCKANALYSIS',
        }).select().single();
      if (insertErr) throw new Error(`Failed to create company: ${insertErr.message}`);
      companyId = newCompany!.id;
    }

    // Get existing years for incremental comparison
    const { data: existingYears } = await supabase
      .from('financial_statement_years')
      .select('id, fiscal_year, checksum')
      .eq('company_id', companyId);

    const existingYearMap = new Map<number, { id: string; checksum: string | null }>();
    for (const ey of existingYears || []) {
      existingYearMap.set(ey.fiscal_year, { id: ey.id, checksum: ey.checksum });
    }

    const jobType = url ? 'import_from_stockanalysis_link' : 'import';
    const { data: job } = await supabase.from('import_jobs').insert({
      company_id: companyId, job_type: jobType as any,
      source_type: (url ? 'STOCKANALYSIS_LINK' : 'STOCKANALYSIS_AUTO') as any,
      status: 'running' as any,
    }).select().single();

    // Scrape overview + three financial pages
    const pages = [
      { url: `${stockBase}/`, type: 'overview' },
      { url: `${stockBase}/financials/`, type: 'income' },
      { url: `${stockBase}/financials/balance-sheet/`, type: 'balance' },
      { url: `${stockBase}/financials/cash-flow-statement/`, type: 'cashflow' },
    ];

    const allMarkdown: Record<string, string> = {};
    const failedPages: string[] = [];
    for (const page of pages) {
      console.log(`Scraping: ${page.url}`);
      const markdown = await scrapePageWithRetry(apiKey, page.url);
      if (markdown) allMarkdown[page.type] = markdown;
      else failedPages.push(page.type);
    }

    const incomeRows = extractTableRows(allMarkdown['income'] || '');
    const balanceRows = extractTableRows(allMarkdown['balance'] || '');
    const cashFlowRows = extractTableRows(allMarkdown['cashflow'] || '');

    // Extract sector from overview page markdown
    // Handles formats: "Sector [Value](url)", "Sector | Value", "**Sector** | [Value](url)", "Sector: Value"
    let scrapedSector: string | null = null;
    const overviewMd = allMarkdown['overview'] || '';
    const sectorMatch = overviewMd.match(/\bSector\b\s*(?:[|:]\s*)?\[?([A-Za-z][A-Za-z ,&/'\-]+?)(?:\]|\(|\||\n|$)/i);
    if (sectorMatch) scrapedSector = sectorMatch[1].trim() || null;

    // Extract reporting currency of the financial statements (distinct from the trading/price
    // currency) — e.g. "Financials in millions EUR." for foreign filers like Ferrari (RACE),
    // whose shares trade in USD on the NYSE but whose statements are reported in EUR.
    let scrapedCurrency: string | null = null;
    const incomeMd = allMarkdown['income'] || '';
    const currencyMatch = incomeMd.match(/Financials in (?:millions|thousands|billions)\s+([A-Z]{3})\b/i);
    if (currencyMatch) scrapedCurrency = currencyMatch[1].toUpperCase();

    const { years, indices } = getYearColumns(incomeRows);
    const bsYears = getYearColumns(balanceRows);
    const cfYears = getYearColumns(cashFlowRows);

    // Extract fiscal year end month from the Period Ending row, reading an actual fiscal-year
    // column (from `indices`) rather than column 0 — column 0 is the TTM/"Current" column, whose
    // as-of date does not represent the company's fiscal year end and, on pages with multiple
    // repeated "Period Ending" rows (StockAnalysis shows one per section), can belong to a
    // different section than the annual figures.
    let fyeMonth: number | null = null;
    const MONTH_ABBR_MAP: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
    const periodRow = incomeRows.get('Period Ending') || incomeRows.get('Fiscal Year End');
    if (periodRow) {
      for (const idx of (indices.length > 0 ? indices : periodRow.map((_, i) => i))) {
        const cell = periodRow[idx];
        if (!cell || cell === '-') continue;
        const nameMatch = cell.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);
        if (nameMatch) { fyeMonth = MONTH_ABBR_MAP[nameMatch[1].toLowerCase()]; break; }
        const isoMatch = cell.match(/\d{4}-(\d{2})-\d{2}/);
        if (isoMatch) { fyeMonth = parseInt(isoMatch[1]); break; }
      }
    }

    // Update company metadata in a single call
    const metaUpdate: Record<string, unknown> = {};
    if (scrapedSector) metaUpdate.sector = scrapedSector;
    if (fyeMonth !== null) metaUpdate.fiscal_year_end_month = fyeMonth;
    if (scrapedCurrency) metaUpdate.currency = scrapedCurrency;
    if (Object.keys(metaUpdate).length > 0) {
      await supabase.from('companies').update(metaUpdate).eq('id', companyId);
    }

    console.log(`Found years: ${years.join(', ')}`);

    if (years.length === 0) {
      if (job) await supabase.from('import_jobs').update({ status: 'failed' as any, finished_at: new Date().toISOString(), error_details: 'No year columns found' }).eq('id', job.id);
      return new Response(JSON.stringify({ success: false, error: 'Could not find year columns in the financial tables.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine which years to process
    let yearsToImport: number[];
    let indicesToUse: number[];
    
    if (specific_year) {
      const idx = years.indexOf(specific_year);
      if (idx === -1) {
        if (job) await supabase.from('import_jobs').update({ status: 'failed' as any, finished_at: new Date().toISOString(), error_details: `Year ${specific_year} not found in source` }).eq('id', job.id);
        return new Response(JSON.stringify({ success: false, error: `Year ${specific_year} not found. Available: ${years.join(', ')}` }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      yearsToImport = [specific_year];
      indicesToUse = [indices[idx]];
    } else {
      yearsToImport = years.slice(0, 10);
      indicesToUse = indices.slice(0, 10);
    }

    const importedYears: number[] = [];
    const updatedYears: number[] = [];
    const skippedYears: number[] = [];
    const logs: string[] = [];
    const warnings: string[] = [];
    const sourceType = url ? 'STOCKANALYSIS_LINK' : 'STOCKANALYSIS_AUTO';
    const importMethod = specific_year ? 'manual_entry' : (url ? 'manual_link' : 'auto_stockanalysis');
    const allMappings = { ...SA_INCOME_MAPPINGS, ...SA_BALANCE_MAPPINGS, ...SA_CASHFLOW_MAPPINGS };

    if (failedPages.length > 0) {
      warnings.push(`Falha ao obter a página de ${failedPages.join(', ')} da StockAnalysis após várias tentativas — esses dados podem estar em falta. Tenta atualizar novamente.`);
    }

    let incomeItemsFoundAcrossYears = false;

    for (let yi = 0; yi < yearsToImport.length; yi++) {
      const fy = yearsToImport[yi];
      const incIdx = indicesToUse[yi];

      let bsIdx = 0;
      for (let i = 0; i < bsYears.years.length; i++) { if (bsYears.years[i] === fy) { bsIdx = bsYears.indices[i]; break; } }
      let cfIdx = 0;
      for (let i = 0; i < cfYears.years.length; i++) { if (cfYears.years[i] === fy) { cfIdx = cfYears.indices[i]; break; } }

      // Compute checksum for this year
      const checksum = computeChecksumSA(allMappings, incomeRows, balanceRows, cashFlowRows, incIdx, bsIdx, cfIdx);
      const existing = existingYearMap.get(fy);

      // Incremental: skip if checksum matches
      if (is_incremental && existing && existing.checksum === checksum) {
        skippedYears.push(fy);
        logs.push(`Ano ${fy} sem alterações`);
        console.log(`Year ${fy}: no changes`);
        continue;
      }

      // Count how many items have data, broken down by statement type so we can detect
      // a statement that came back entirely empty (e.g. a page that failed to scrape or
      // whose table layout didn't match our labels) instead of silently marking it "imported".
      let itemCount = 0;
      let incomeItemCount = 0;
      for (const [, mapping] of Object.entries(allMappings)) {
        let rows: Map<string, string[]>;
        let colIdx: number;
        if (mapping.statementType === 'income_statement') { rows = incomeRows; colIdx = incIdx; }
        else if (mapping.statementType === 'balance_sheet') { rows = balanceRows; colIdx = bsIdx; }
        else { rows = cashFlowRows; colIdx = cfIdx; }
        const val = getVal(rows, mapping.labels, colIdx);
        if (val !== null) {
          itemCount++;
          if (mapping.statementType === 'income_statement') incomeItemCount++;
        }
      }
      if (incomeItemCount > 0) incomeItemsFoundAcrossYears = true;

      const dataStatus = (itemCount < 5 || incomeItemCount === 0) ? 'draft' : 'imported';

      let yearId: string;
      if (existing) {
        yearId = existing.id;
        await supabase.from('financial_statement_years').update({
          source_type: sourceType as any, import_method: importMethod as any,
          data_status: dataStatus as any, source_url: stockBase, checksum,
          updated_at: new Date().toISOString(),
        }).eq('id', yearId);
        updatedYears.push(fy);
        logs.push(`Ano ${fy} atualizado`);
        console.log(`Year ${fy}: updated`);
      } else {
        const { data: newYear, error: yearErr } = await supabase
          .from('financial_statement_years').insert({
            company_id: companyId, fiscal_year: fy, source_type: sourceType as any,
            import_method: importMethod as any, data_status: dataStatus as any,
            source_url: stockBase, checksum,
          }).select().single();
        if (yearErr) { console.error(`Failed year ${fy}:`, yearErr); logs.push(`Ano ${fy} falhou`); continue; }
        yearId = newYear!.id;
        importedYears.push(fy);
        logs.push(`Novo ano encontrado: ${fy}`);
        console.log(`Year ${fy}: new`);
      }

      // Upsert line items
      for (const [normalizedKey, mapping] of Object.entries(allMappings)) {
        let rows: Map<string, string[]>;
        let colIdx: number;
        if (mapping.statementType === 'income_statement') { rows = incomeRows; colIdx = incIdx; }
        else if (mapping.statementType === 'balance_sheet') { rows = balanceRows; colIdx = bsIdx; }
        else { rows = cashFlowRows; colIdx = cfIdx; }

        const val = getVal(rows, mapping.labels, colIdx);
        if (val !== null) {
          await supabase.from('financial_line_items').upsert({
            statement_year_id: yearId, normalized_key: normalizedKey,
            statement_type: mapping.statementType as any,
            raw_value: val, normalized_value: val,
            source_label: mapping.labels[0], source_type: sourceType as any,
            confidence_score: 0.85,
            unit: normalizedKey === 'shares_outstanding' ? 'shares' : (normalizedKey.startsWith('eps') || normalizedKey === 'book_value_per_share' ? `${scrapedCurrency || 'USD'}/share` : (scrapedCurrency || 'USD')),
          }, { onConflict: 'statement_year_id,normalized_key' });
        }
      }
    }

    // If the income page scraped ok but none of the processed years yielded any income-statement
    // value, the table layout likely didn't match our labels — surface it instead of leaving the
    // user with a silently "imported" Income Statement full of zeros.
    if (!incomeItemsFoundAcrossYears && (importedYears.length + updatedYears.length) > 0 && !failedPages.includes('income')) {
      warnings.push('Não foi possível extrair dados do Income Statement (Revenue, Lucro, EPS, etc.) para nenhum dos anos processados — a estrutura da página pode ter mudado. Os restantes dados (Balanço, Cash Flow) foram importados normalmente.');
    }

    // Detect missing years
    const missingYears = years.filter(y => !existingYearMap.has(y) && !importedYears.includes(y));

    await supabase.from('companies').update({
      last_imported_at: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString(),
    }).eq('id', companyId);

    const allProcessed = [...importedYears, ...updatedYears].sort();
    if (job) {
      await supabase.from('import_jobs').update({
        status: 'completed' as any, finished_at: new Date().toISOString(),
        years_imported: allProcessed, log_summary: [...logs, ...warnings].join('; '),
      }).eq('id', job.id);
    }

    console.log(`StockAnalysis import complete: ${importedYears.length} new, ${updatedYears.length} updated, ${skippedYears.length} skipped`);

    return new Response(JSON.stringify({
      success: true, company_id: companyId, ticker: effectiveTicker,
      years_imported: importedYears.sort(), years_updated: updatedYears.sort(),
      years_skipped: skippedYears.sort(), years_available: years,
      missing_years: missingYears, logs, warnings, source: sourceType,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('StockAnalysis import error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
