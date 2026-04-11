import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SEC_USER_AGENT = 'LovableFinApp/1.0 (contact@lovable.dev)';

// XBRL tag mappings to normalized keys
const XBRL_MAPPINGS: Record<string, { tags: string[]; statementType: string }> = {
  // Income Statement
  revenue: { tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], statementType: 'income_statement' },
  cost_of_revenue: { tags: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'], statementType: 'income_statement' },
  gross_profit: { tags: ['GrossProfit'], statementType: 'income_statement' },
  operating_income: { tags: ['OperatingIncomeLoss'], statementType: 'income_statement' },
  net_income: { tags: ['NetIncomeLoss'], statementType: 'income_statement' },
  eps_basic: { tags: ['EarningsPerShareBasic'], statementType: 'income_statement' },
  eps_diluted: { tags: ['EarningsPerShareDiluted'], statementType: 'income_statement' },
  sga: { tags: ['SellingGeneralAndAdministrativeExpense'], statementType: 'income_statement' },
  rd: { tags: ['ResearchAndDevelopmentExpense'], statementType: 'income_statement' },
  interest_expense: { tags: ['InterestExpense', 'InterestExpenseDebt'], statementType: 'income_statement' },
  depreciation_amortization: { tags: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization'], statementType: 'income_statement' },
  ebitda: { tags: ['EarningsBeforeInterestTaxesDepreciationAndAmortization'], statementType: 'income_statement' },
  // Balance Sheet
  cash_and_equivalents: { tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsAndShortTermInvestments'], statementType: 'balance_sheet' },
  current_assets: { tags: ['AssetsCurrent'], statementType: 'balance_sheet' },
  total_assets: { tags: ['Assets'], statementType: 'balance_sheet' },
  current_liabilities: { tags: ['LiabilitiesCurrent'], statementType: 'balance_sheet' },
  total_liabilities: { tags: ['Liabilities'], statementType: 'balance_sheet' },
  long_term_debt: { tags: ['LongTermDebt', 'LongTermDebtNoncurrent'], statementType: 'balance_sheet' },
  short_term_debt: { tags: ['ShortTermBorrowings', 'CommercialPaper'], statementType: 'balance_sheet' },
  shareholders_equity: { tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], statementType: 'balance_sheet' },
  shares_outstanding: { tags: ['CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding'], statementType: 'balance_sheet' },
  // Cash Flow
  operating_cash_flow: { tags: ['NetCashProvidedByUsedInOperatingActivities'], statementType: 'cash_flow' },
  capital_expenditures: { tags: ['PaymentsToAcquirePropertyPlantAndEquipment'], statementType: 'cash_flow' },
  dividends_paid: { tags: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], statementType: 'cash_flow' },
  share_repurchases: { tags: ['PaymentsForRepurchaseOfCommonStock'], statementType: 'cash_flow' },
};

interface XBRLFact {
  val: number;
  start?: string;
  end: string;
  fy?: number;
  fp?: string;
  form?: string;
  frame?: string | null;
  accn?: string;
  filed?: string;
}

interface ExtractedFact {
  value: number;
  sourceTag: string;
  endDate: string;
  filedDate: string | null;
}

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { headers });
      if (resp.status === 429) {
        const wait = Math.pow(2, i + 1) * 1000;
        console.log(`Rate limited, waiting ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw new Error('Max retries exceeded');
}

function parseSecDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function getFactEndYear(entry: XBRLFact): number | null {
  const endDate = parseSecDate(entry.end);
  return endDate ? endDate.getUTCFullYear() : null;
}

function getFactPeriodDays(entry: XBRLFact): number | null {
  const startDate = parseSecDate(entry.start);
  const endDate = parseSecDate(entry.end);
  if (!startDate || !endDate) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function isAnnual10KFact(entry: XBRLFact): boolean {
  if (entry.fp !== 'FY') return false;
  if (entry.form !== '10-K' && entry.form !== '10-K/A') return false;
  if (!entry.end) return false;

  const periodDays = getFactPeriodDays(entry);
  if (periodDays === null) return true;

  // Accept normal 52/53-week annual periods and avoid shorter comparative fragments.
  return periodDays >= 300 && periodDays <= 380;
}

function compareDatesDesc(a?: string | null, b?: string | null): number {
  const aDate = parseSecDate(a);
  const bDate = parseSecDate(b);

  if (aDate && bDate) {
    return bDate.getTime() - aDate.getTime();
  }

  if (aDate) return -1;
  if (bDate) return 1;
  return 0;
}

function chooseBestAnnualFact(entries: XBRLFact[]): XBRLFact {
  return [...entries].sort((a, b) => {
    const filedCompare = compareDatesDesc(a.filed, b.filed);
    if (filedCompare !== 0) return filedCompare;

    const endCompare = compareDatesDesc(a.end, b.end);
    if (endCompare !== 0) return endCompare;

    return 0;
  })[0];
}

async function resolveCIK(ticker: string): Promise<{ cik: string; name: string } | null> {
  const resp = await fetchWithRetry(
    'https://www.sec.gov/files/company_tickers.json',
    { 'User-Agent': SEC_USER_AGENT, 'Accept': 'application/json' }
  );
  if (!resp.ok) throw new Error(`Failed to fetch company tickers: ${resp.status}`);
  const data = await resp.json();

  const upperTicker = ticker.toUpperCase();
  for (const key of Object.keys(data)) {
    const entry = data[key];
    if (entry.ticker?.toUpperCase() === upperTicker) {
      return {
        cik: String(entry.cik_str).padStart(10, '0'),
        name: entry.title,
      };
    }
  }
  return null;
}

function extractAnnualFacts(
  facts: Record<string, any>,
  targetYears: number[]
): Map<number, Map<string, ExtractedFact>> {
  const yearData = new Map<number, Map<string, ExtractedFact>>();
  const targetYearSet = new Set(targetYears);
  const usGaap = facts['us-gaap'] || {};

  for (const [normalizedKey, mapping] of Object.entries(XBRL_MAPPINGS)) {
    for (const tag of mapping.tags) {
      const concept = usGaap[tag];
      if (!concept?.units) continue;

      const entries = Object.values(concept.units).flatMap((unitEntries) =>
        Array.isArray(unitEntries) ? (unitEntries as XBRLFact[]) : []
      );

      const annualEntries = entries.filter(isAnnual10KFact);
      const entriesByEndYear = new Map<number, XBRLFact[]>();

      for (const entry of annualEntries) {
        const endYear = getFactEndYear(entry);
        if (!endYear || !targetYearSet.has(endYear)) continue;

        if (!entriesByEndYear.has(endYear)) {
          entriesByEndYear.set(endYear, []);
        }
        entriesByEndYear.get(endYear)!.push(entry);
      }

      for (const [endYear, yearEntries] of entriesByEndYear.entries()) {
        const best = chooseBestAnnualFact(yearEntries);

        if (!yearData.has(endYear)) {
          yearData.set(endYear, new Map());
        }

        const yearMap = yearData.get(endYear)!;
        if (!yearMap.has(normalizedKey)) {
          yearMap.set(normalizedKey, {
            value: best.val,
            sourceTag: tag,
            endDate: best.end,
            filedDate: best.filed || null,
          });
        }
      }
    }
  }

  return yearData;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { ticker } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ success: false, error: 'Ticker is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Starting SEC import for ticker: ${ticker}`);

    // 1. Resolve ticker to CIK
    const cikResult = await resolveCIK(ticker);
    if (!cikResult) {
      return new Response(JSON.stringify({ success: false, error: `Ticker "${ticker}" not found in SEC database. This may not be a US company.` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Resolved ${ticker} to CIK ${cikResult.cik} (${cikResult.name})`);

    // 2. Upsert company
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .upsert({
        ticker: ticker.toUpperCase(),
        name: cikResult.name,
        cik: cikResult.cik,
        region_type: 'US' as const,
        sec_enabled: true,
        primary_data_source: 'SEC_XBRL',
        country: 'US',
      }, { onConflict: 'ticker,exchange' })
      .select()
      .single();

    // If upsert failed due to conflict, try to find existing
    let companyId: string;
    if (companyErr) {
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('ticker', ticker.toUpperCase())
        .single();
      if (!existing) {
        // Insert without exchange constraint
        const { data: newCompany, error: insertErr } = await supabase
          .from('companies')
          .insert({
            ticker: ticker.toUpperCase(),
            name: cikResult.name,
            cik: cikResult.cik,
            region_type: 'US' as const,
            sec_enabled: true,
            primary_data_source: 'SEC_XBRL',
            country: 'US',
          })
          .select()
          .single();
        if (insertErr) throw new Error(`Failed to create company: ${insertErr.message}`);
        companyId = newCompany!.id;
      } else {
        companyId = existing.id;
        // Update CIK and SEC info
        await supabase.from('companies').update({
          cik: cikResult.cik,
          name: cikResult.name,
          sec_enabled: true,
          primary_data_source: 'SEC_XBRL',
          region_type: 'US' as const,
        }).eq('id', companyId);
      }
    } else {
      companyId = company!.id;
    }

    // 3. Create import job
    const { data: job } = await supabase.from('import_jobs').insert({
      company_id: companyId,
      job_type: 'import' as const,
      source_type: 'SEC_XBRL' as const,
      status: 'running' as const,
    }).select().single();

    // 4. Fetch company facts from SEC
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikResult.cik}.json`;
    console.log(`Fetching company facts from: ${factsUrl}`);

    const factsResp = await fetchWithRetry(factsUrl, {
      'User-Agent': SEC_USER_AGENT,
      'Accept': 'application/json',
    });

    if (!factsResp.ok) {
      const errMsg = `SEC API returned ${factsResp.status}`;
      if (job) {
        await supabase.from('import_jobs').update({
          status: 'failed' as const,
          finished_at: new Date().toISOString(),
          error_details: errMsg,
        }).eq('id', job.id);
      }
      return new Response(JSON.stringify({ success: false, error: errMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const factsData = await factsResp.json();
    const facts = factsData.facts || {};

    // 5. Determine target years (last 12 candidate years, then persist what exists)
    const currentYear = new Date().getFullYear();
    const targetYears = Array.from({ length: 12 }, (_, i) => currentYear - i);

    // 6. Extract annual data using the actual fiscal period end year
    const yearData = extractAnnualFacts(facts, targetYears);
    console.log(`Extracted data for ${yearData.size} years: ${Array.from(yearData.keys()).sort().join(', ')}`);

    if (yearData.size === 0) {
      if (job) {
        await supabase.from('import_jobs').update({
          status: 'failed' as const,
          finished_at: new Date().toISOString(),
          error_details: 'No annual financial data found in SEC XBRL',
        }).eq('id', job.id);
      }
      return new Response(JSON.stringify({ success: false, error: 'No annual financial data found in SEC filings' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 7. Persist to DB
    const importedYears: number[] = [];

    for (const [fy, items] of Array.from(yearData.entries()).sort((a, b) => a[0] - b[0])) {
      const latestFiledDate = Array.from(items.values())
        .map((item) => item.filedDate)
        .filter((date): date is string => Boolean(date))
        .sort((a, b) => b.localeCompare(a))[0] || null;

      // Upsert financial_statement_years
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
          source_type: 'SEC_XBRL' as const,
          import_method: 'auto_sec' as const,
          data_status: 'imported' as const,
          source_url: factsUrl,
          filing_type: '10-K',
          filing_date: latestFiledDate,
          updated_at: new Date().toISOString(),
        }).eq('id', yearId);
      } else {
        const { data: newYear, error: yearErr } = await supabase
          .from('financial_statement_years')
          .insert({
            company_id: companyId,
            fiscal_year: fy,
            source_type: 'SEC_XBRL' as const,
            import_method: 'auto_sec' as const,
            data_status: 'imported' as const,
            source_url: factsUrl,
            filing_type: '10-K',
            filing_date: latestFiledDate,
          })
          .select()
          .single();
        if (yearErr) { console.error(`Failed to insert year ${fy}:`, yearErr); continue; }
        yearId = newYear!.id;
      }

      // Upsert line items
      for (const [normalizedKey, fact] of items.entries()) {
        const mapping = XBRL_MAPPINGS[normalizedKey];
        const statementType = mapping?.statementType || 'income_statement';

        await supabase.from('financial_line_items').upsert({
          statement_year_id: yearId,
          normalized_key: normalizedKey,
          statement_type: statementType as any,
          raw_value: fact.value,
          normalized_value: fact.value,
          source_label: fact.sourceTag,
          source_type: 'SEC_XBRL' as const,
          confidence_score: 1.0,
          unit: normalizedKey === 'shares_outstanding' ? 'shares' : (normalizedKey.startsWith('eps') ? 'USD/share' : 'USD'),
          source_reference: fact.endDate,
        }, { onConflict: 'statement_year_id,normalized_key' });
      }

      // Calculate and store derived items (free_cash_flow)
      const ocf = items.get('operating_cash_flow');
      const capex = items.get('capital_expenditures');
      if (ocf && capex) {
        const fcf = ocf.value - Math.abs(capex.value);
        await supabase.from('financial_line_items').upsert({
          statement_year_id: yearId,
          normalized_key: 'free_cash_flow',
          statement_type: 'cash_flow' as any,
          raw_value: fcf,
          normalized_value: fcf,
          source_label: 'Calculated: OCF - |CapEx|',
          source_type: 'SEC_XBRL' as const,
          confidence_score: 0.95,
          unit: 'USD',
          source_reference: latestFiledDate,
        }, { onConflict: 'statement_year_id,normalized_key' });
      }

      importedYears.push(fy);
    }

    // 8. Update company timestamps
    await supabase.from('companies').update({
      last_imported_at: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString(),
    }).eq('id', companyId);

    // 9. Complete import job
    if (job) {
      await supabase.from('import_jobs').update({
        status: 'completed' as const,
        finished_at: new Date().toISOString(),
        years_imported: importedYears.sort(),
        log_summary: `Imported ${importedYears.length} years from SEC XBRL for ${ticker}`,
      }).eq('id', job.id);
    }

    console.log(`SEC import complete: ${importedYears.length} years for ${ticker}`);

    return new Response(JSON.stringify({
      success: true,
      company_id: companyId,
      ticker: ticker.toUpperCase(),
      name: cikResult.name,
      years_imported: importedYears.sort(),
      source: 'SEC_XBRL',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('SEC import error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});