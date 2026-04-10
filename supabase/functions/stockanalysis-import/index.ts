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

function getVal(rows: Map<string, string[]>, labels: string[], colIdx: number): number | null {
  for (const label of labels) {
    const row = rows.get(label);
    if (row && colIdx < row.length) {
      const v = parseNumber(row[colIdx]);
      if (v !== null) return v;
    }
  }
  return null;
}

// Mapping from StockAnalysis labels to normalized keys
const SA_INCOME_MAPPINGS: Record<string, { labels: string[]; statementType: string }> = {
  revenue: { labels: ['Revenue'], statementType: 'income_statement' },
  cost_of_revenue: { labels: ['Cost of Revenue'], statementType: 'income_statement' },
  gross_profit: { labels: ['Gross Profit'], statementType: 'income_statement' },
  operating_income: { labels: ['Operating Income', 'Operating Income (EBIT)'], statementType: 'income_statement' },
  net_income: { labels: ['Net Income', 'Net Income to Common'], statementType: 'income_statement' },
  eps_basic: { labels: ['EPS (Basic)'], statementType: 'income_statement' },
  eps_diluted: { labels: ['EPS (Diluted)'], statementType: 'income_statement' },
  shares_outstanding: { labels: ['Shares Outstanding (Diluted)', 'Shares Outstanding (Basic)'], statementType: 'income_statement' },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { ticker, url, company_name, exchange } = await req.json();

    if (!ticker && !url) {
      return new Response(JSON.stringify({ success: false, error: 'Ticker or URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine the StockAnalysis base URL
    let stockBase: string;
    let effectiveTicker = ticker?.toUpperCase();
    
    if (url) {
      const match = url.match(/(https:\/\/stockanalysis\.com\/stocks\/[^/]+)/);
      if (!match) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid StockAnalysis URL. Expected format: https://stockanalysis.com/stocks/TICKER/' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      stockBase = match[1];
      // Extract ticker from URL
      const tickerMatch = stockBase.match(/\/stocks\/([^/]+)$/);
      if (tickerMatch) effectiveTicker = tickerMatch[1].toUpperCase();
    } else {
      stockBase = `https://stockanalysis.com/stocks/${ticker.toLowerCase()}`;
    }

    console.log(`Starting StockAnalysis import for ${effectiveTicker} from ${stockBase}`);

    // Upsert company
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id, region_type')
      .eq('ticker', effectiveTicker)
      .maybeSingle();

    let companyId: string;
    if (existingCompany) {
      companyId = existingCompany.id;
      await supabase.from('companies').update({
        stockanalysis_url: stockBase,
        primary_data_source: existingCompany.region_type === 'US' ? 'SEC_XBRL' : 'STOCKANALYSIS',
        ...(company_name ? { name: company_name } : {}),
        ...(exchange ? { exchange } : {}),
      }).eq('id', companyId);
    } else {
      const { data: newCompany, error: insertErr } = await supabase
        .from('companies')
        .insert({
          ticker: effectiveTicker,
          name: company_name || effectiveTicker,
          exchange: exchange || null,
          region_type: 'NON_US' as const,
          stockanalysis_url: stockBase,
          primary_data_source: 'STOCKANALYSIS',
        })
        .select()
        .single();
      if (insertErr) throw new Error(`Failed to create company: ${insertErr.message}`);
      companyId = newCompany!.id;
    }

    // Create import job
    const jobType = url ? 'import_from_stockanalysis_link' : 'import';
    const { data: job } = await supabase.from('import_jobs').insert({
      company_id: companyId,
      job_type: jobType as any,
      source_type: (url ? 'STOCKANALYSIS_LINK' : 'STOCKANALYSIS_AUTO') as any,
      status: 'running' as any,
    }).select().single();

    // Scrape all three financial pages
    const pages = [
      { url: `${stockBase}/financials/`, type: 'income' },
      { url: `${stockBase}/financials/balance-sheet/`, type: 'balance' },
      { url: `${stockBase}/financials/cash-flow-statement/`, type: 'cashflow' },
    ];

    const allMarkdown: Record<string, string> = {};
    
    for (const page of pages) {
      console.log(`Scraping: ${page.url}`);
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: page.url,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        });
        const data = await response.json();
        if (response.ok) {
          allMarkdown[page.type] = data.data?.markdown || data.markdown || '';
        } else {
          console.error(`Failed to scrape ${page.type}:`, data);
        }
      } catch (e) {
        console.error(`Error scraping ${page.type}:`, e);
      }
    }

    // Parse tables
    const incomeRows = extractTableRows(allMarkdown['income'] || '');
    const balanceRows = extractTableRows(allMarkdown['balance'] || '');
    const cashFlowRows = extractTableRows(allMarkdown['cashflow'] || '');

    // Get years from income statement
    const { years, indices } = getYearColumns(incomeRows);
    const bsYears = getYearColumns(balanceRows);
    const cfYears = getYearColumns(cashFlowRows);

    console.log(`Found years: ${years.join(', ')}`);

    if (years.length === 0) {
      if (job) {
        await supabase.from('import_jobs').update({
          status: 'failed' as any,
          finished_at: new Date().toISOString(),
          error_details: 'No year columns found in financial tables',
        }).eq('id', job.id);
      }
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not find year columns in the financial tables. Check the StockAnalysis URL.',
      }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Import all years (up to 10 most recent)
    const yearsToImport = years.slice(0, 10);
    const importedYears: number[] = [];
    const sourceType = url ? 'STOCKANALYSIS_LINK' : 'STOCKANALYSIS_AUTO';
    const importMethod = url ? 'manual_link' : 'auto_stockanalysis';

    for (let yi = 0; yi < yearsToImport.length; yi++) {
      const fy = yearsToImport[yi];
      const incIdx = indices[yi];

      // Find matching balance sheet and cash flow indices
      let bsIdx = 0;
      for (let i = 0; i < bsYears.years.length; i++) {
        if (bsYears.years[i] === fy) { bsIdx = bsYears.indices[i]; break; }
      }
      let cfIdx = 0;
      for (let i = 0; i < cfYears.years.length; i++) {
        if (cfYears.years[i] === fy) { cfIdx = cfYears.indices[i]; break; }
      }

      // Upsert financial_statement_year
      const { data: existingYear } = await supabase
        .from('financial_statement_years')
        .select('id')
        .eq('company_id', companyId)
        .eq('fiscal_year', fy)
        .single();

      let yearId: string;
      if (existingYear) {
        yearId = existingYear.id;
        await supabase.from('financial_statement_years').update({
          source_type: sourceType as any,
          import_method: importMethod as any,
          data_status: 'imported' as any,
          source_url: stockBase,
          updated_at: new Date().toISOString(),
        }).eq('id', yearId);
      } else {
        const { data: newYear, error: yearErr } = await supabase
          .from('financial_statement_years')
          .insert({
            company_id: companyId,
            fiscal_year: fy,
            source_type: sourceType as any,
            import_method: importMethod as any,
            data_status: 'imported' as any,
            source_url: stockBase,
          })
          .select()
          .single();
        if (yearErr) { console.error(`Failed year ${fy}:`, yearErr); continue; }
        yearId = newYear!.id;
      }

      // Extract and store all line items
      const allMappings = { ...SA_INCOME_MAPPINGS, ...SA_BALANCE_MAPPINGS, ...SA_CASHFLOW_MAPPINGS };
      
      for (const [normalizedKey, mapping] of Object.entries(allMappings)) {
        let rows: Map<string, string[]>;
        let colIdx: number;
        
        if (mapping.statementType === 'income_statement') {
          rows = incomeRows; colIdx = incIdx;
        } else if (mapping.statementType === 'balance_sheet') {
          rows = balanceRows; colIdx = bsIdx;
        } else {
          rows = cashFlowRows; colIdx = cfIdx;
        }

        const val = getVal(rows, mapping.labels, colIdx);
        if (val !== null) {
          await supabase.from('financial_line_items').upsert({
            statement_year_id: yearId,
            normalized_key: normalizedKey,
            statement_type: mapping.statementType as any,
            raw_value: val,
            normalized_value: val,
            source_label: mapping.labels[0],
            source_type: sourceType as any,
            confidence_score: 0.85,
            unit: normalizedKey === 'shares_outstanding' ? 'shares' : (normalizedKey.startsWith('eps') || normalizedKey === 'book_value_per_share' ? 'USD/share' : 'USD'),
          }, { onConflict: 'statement_year_id,normalized_key' });
        }
      }

      importedYears.push(fy);
    }

    // Update company timestamps
    await supabase.from('companies').update({
      last_imported_at: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString(),
    }).eq('id', companyId);

    // Complete job
    if (job) {
      await supabase.from('import_jobs').update({
        status: 'completed' as any,
        finished_at: new Date().toISOString(),
        years_imported: importedYears.sort(),
        log_summary: `Imported ${importedYears.length} years from StockAnalysis for ${effectiveTicker}`,
      }).eq('id', job.id);
    }

    console.log(`StockAnalysis import complete: ${importedYears.length} years for ${effectiveTicker}`);

    return new Response(JSON.stringify({
      success: true,
      company_id: companyId,
      ticker: effectiveTicker,
      years_imported: importedYears.sort(),
      source: sourceType,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('StockAnalysis import error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
