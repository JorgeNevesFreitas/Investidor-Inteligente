import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SEC_USER_AGENT = 'LovableFinApp/1.0 (contact@lovable.dev)';

const XBRL_MAPPINGS: Record<string, { tags: string[]; statementType: string }> = {
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
  cash_and_equivalents: { tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsAndShortTermInvestments'], statementType: 'balance_sheet' },
  current_assets: { tags: ['AssetsCurrent'], statementType: 'balance_sheet' },
  total_assets: { tags: ['Assets'], statementType: 'balance_sheet' },
  current_liabilities: { tags: ['LiabilitiesCurrent'], statementType: 'balance_sheet' },
  total_liabilities: { tags: ['Liabilities'], statementType: 'balance_sheet' },
  long_term_debt: { tags: ['LongTermDebt', 'LongTermDebtNoncurrent'], statementType: 'balance_sheet' },
  short_term_debt: { tags: ['ShortTermBorrowings', 'CommercialPaper'], statementType: 'balance_sheet' },
  shareholders_equity: { tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], statementType: 'balance_sheet' },
  shares_outstanding: { tags: ['CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding'], statementType: 'balance_sheet' },
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
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
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
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
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
  return periodDays >= 300 && periodDays <= 380;
}

function compareDatesDesc(a?: string | null, b?: string | null): number {
  const aDate = parseSecDate(a);
  const bDate = parseSecDate(b);
  if (aDate && bDate) return bDate.getTime() - aDate.getTime();
  if (aDate) return -1;
  if (bDate) return 1;
  return 0;
}

function chooseBestAnnualFact(entries: XBRLFact[]): XBRLFact {
  return [...entries].sort((a, b) => {
    const filedCompare = compareDatesDesc(a.filed, b.filed);
    if (filedCompare !== 0) return filedCompare;
    return compareDatesDesc(a.end, b.end);
  })[0];
}

function sicToSector(sic: number): string | null {
  if ((sic >= 3570 && sic <= 3579) || (sic >= 3670 && sic <= 3679) || (sic >= 7370 && sic <= 7379)) return 'Technology';
  if ((sic >= 2830 && sic <= 2836) || (sic >= 3840 && sic <= 3849) || (sic >= 8000 && sic <= 8099) || (sic >= 2860 && sic <= 2869)) return 'Healthcare';
  if ((sic >= 6000 && sic <= 6499) || (sic >= 6700 && sic <= 6799)) return 'Financial Services';
  if (sic >= 6500 && sic <= 6599) return 'Real Estate';
  if ((sic >= 4810 && sic <= 4899) || (sic >= 7800 && sic <= 7999) || sic === 4833 || sic === 4832) return 'Communication Services';
  if ((sic >= 1300 && sic <= 1399) || (sic >= 2900 && sic <= 2999)) return 'Energy';
  if (sic >= 4900 && sic <= 4991) return 'Utilities';
  if ((sic >= 1000 && sic <= 1299) || (sic >= 1400 && sic <= 1499) || (sic >= 2400 && sic <= 2499) || (sic >= 2600 && sic <= 2699) || (sic >= 2800 && sic <= 2829) || (sic >= 3300 && sic <= 3399)) return 'Basic Materials';
  if ((sic >= 100 && sic <= 999) || (sic >= 2000 && sic <= 2199) || (sic >= 5400 && sic <= 5499)) return 'Consumer Staples';
  if ((sic >= 2200 && sic <= 2399) || (sic >= 2500 && sic <= 2599) || (sic >= 3700 && sic <= 3799) || (sic >= 5200 && sic <= 5399) || (sic >= 5500 && sic <= 5999) || sic === 7011 || (sic >= 7200 && sic <= 7299)) return 'Consumer Cyclical';
  if ((sic >= 1500 && sic <= 1799) || (sic >= 3400 && sic <= 3569) || (sic >= 3580 && sic <= 3669) || (sic >= 3680 && sic <= 3699) || (sic >= 4000 && sic <= 4799) || (sic >= 5000 && sic <= 5199) || (sic >= 7300 && sic <= 7399) || (sic >= 8700 && sic <= 8799)) return 'Industrials';
  return null;
}

async function fetchEdgarSubmissions(cik: string): Promise<{ sector: string | null; fiscalYearEndMonth: number | null }> {
  try {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const resp = await fetchWithRetry(url, { 'User-Agent': SEC_USER_AGENT, 'Accept': 'application/json' });
    if (!resp.ok) return { sector: null, fiscalYearEndMonth: null };
    const data = await resp.json();
    const sicNum = typeof data.sic === 'string' ? parseInt(data.sic) : (data.sic ?? 0);
    const sector = sicNum ? sicToSector(sicNum) : null;
    let fiscalYearEndMonth: number | null = null;
    // fiscalYearEnd is MMDD format e.g. "0930" for September 30
    const fye = data.fiscalYearEnd;
    if (typeof fye === 'string' && fye.length >= 2) {
      const m = parseInt(fye.slice(0, 2));
      if (m >= 1 && m <= 12) fiscalYearEndMonth = m;
    }
    return { sector, fiscalYearEndMonth };
  } catch {
    return { sector: null, fiscalYearEndMonth: null };
  }
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
      return { cik: String(entry.cik_str).padStart(10, '0'), name: entry.title };
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

      // For balance sheet items (point-in-time), also accept entries without start date
      const isBalanceSheet = mapping.statementType === 'balance_sheet';
      
      const annualEntries = entries.filter(entry => {
        if (entry.fp !== 'FY') return false;
        if (entry.form !== '10-K' && entry.form !== '10-K/A') return false;
        if (!entry.end) return false;
        
        if (isBalanceSheet && !entry.start) return true; // point-in-time OK
        
        const periodDays = getFactPeriodDays(entry);
        if (periodDays === null) return true;
        return periodDays >= 300 && periodDays <= 380;
      });

      const entriesByEndYear = new Map<number, XBRLFact[]>();
      for (const entry of annualEntries) {
        const endYear = getFactEndYear(entry);
        if (!endYear || !targetYearSet.has(endYear)) continue;
        if (!entriesByEndYear.has(endYear)) entriesByEndYear.set(endYear, []);
        entriesByEndYear.get(endYear)!.push(entry);
      }

      for (const [endYear, yearEntries] of entriesByEndYear.entries()) {
        const best = chooseBestAnnualFact(yearEntries);
        if (!yearData.has(endYear)) yearData.set(endYear, new Map());
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

// Generate a simple checksum from line items to detect real changes
function computeChecksum(items: Map<string, ExtractedFact>): string {
  const parts: string[] = [];
  for (const [key, fact] of [...items.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    parts.push(`${key}:${fact.value}`);
  }
  // Simple hash
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
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
    const body = await req.json();
    const { ticker, specific_year, is_incremental = true } = body;
    
    if (!ticker) {
      return new Response(JSON.stringify({ success: false, error: 'Ticker is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Starting SEC import for ${ticker} (incremental=${is_incremental}, specific_year=${specific_year || 'none'})`);

    const cikResult = await resolveCIK(ticker);
    if (!cikResult) {
      return new Response(JSON.stringify({ success: false, error: `Ticker "${ticker}" not found in SEC database. This may not be a US company.` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Resolved ${ticker} to CIK ${cikResult.cik} (${cikResult.name})`);

    const { sector, fiscalYearEndMonth } = await fetchEdgarSubmissions(cikResult.cik);
    console.log(`EDGAR metadata: sector=${sector}, fyeMonth=${fiscalYearEndMonth}`);

    // Upsert company
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('ticker', ticker.toUpperCase())
      .order('last_imported_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const companyMeta = {
      ...(sector ? { sector } : {}),
      ...(fiscalYearEndMonth !== null ? { fiscal_year_end_month: fiscalYearEndMonth } : {}),
    };

    let companyId: string;
    if (existingCompany) {
      companyId = existingCompany.id;
      await supabase.from('companies').update({
        name: cikResult.name, cik: cikResult.cik, region_type: 'US' as const,
        sec_enabled: true, primary_data_source: 'SEC_XBRL', country: 'US',
        ...companyMeta,
      }).eq('id', companyId);
    } else {
      const { data: newCompany, error: insertErr } = await supabase
        .from('companies').insert({
          ticker: ticker.toUpperCase(), name: cikResult.name, cik: cikResult.cik,
          region_type: 'US' as const, sec_enabled: true, primary_data_source: 'SEC_XBRL', country: 'US',
          ...companyMeta,
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

    // Create import job
    const jobType = specific_year ? 'import' : 'import';
    const { data: job } = await supabase.from('import_jobs').insert({
      company_id: companyId, job_type: jobType as any,
      source_type: 'SEC_XBRL' as const, status: 'running' as const,
    }).select().single();

    // Fetch SEC data
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikResult.cik}.json`;
    const factsResp = await fetchWithRetry(factsUrl, {
      'User-Agent': SEC_USER_AGENT, 'Accept': 'application/json',
    });

    if (!factsResp.ok) {
      const errMsg = `SEC API returned ${factsResp.status}`;
      if (job) await supabase.from('import_jobs').update({ status: 'failed' as const, finished_at: new Date().toISOString(), error_details: errMsg }).eq('id', job.id);
      return new Response(JSON.stringify({ success: false, error: errMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const factsData = await factsResp.json();
    const facts = factsData.facts || {};
    const hasUsGaapFacts = !!facts['us-gaap'] && Object.keys(facts['us-gaap']).length > 0;
    const hasIfrsFacts = !!facts['ifrs-full'] && Object.keys(facts['ifrs-full']).length > 0;

    // Determine target years
    const currentYear = new Date().getFullYear();
    let targetYears: number[];
    if (specific_year) {
      targetYears = [specific_year];
    } else {
      targetYears = Array.from({ length: 12 }, (_, i) => currentYear - i);
    }

    const yearData = extractAnnualFacts(facts, targetYears);

    // Detect available years from source for reporting
    const allAvailableYears = Array.from(yearData.keys()).sort();
    const existingDbYears = Array.from(existingYearMap.keys()).sort();
    
    console.log(`Source years: ${allAvailableYears.join(', ')}`);
    console.log(`DB years: ${existingDbYears.join(', ')}`);

    if (yearData.size === 0) {
      let errMsg: string;
      let suggestAlternativeSource: string | undefined;

      if (!hasUsGaapFacts && hasIfrsFacts) {
        // Foreign private issuer filing Form 20-F under IFRS (e.g. Ferrari N.V./RACE) —
        // has no US-GAAP/10-K data for our XBRL mappings to extract.
        errMsg = `${cikResult.name} reporta à SEC em IFRS (Formulário 20-F), não em US-GAAP/10-K. A importação SEC XBRL só suporta empresas com filings 10-K em US-GAAP. Usa a fonte StockAnalysis para esta empresa.`;
        suggestAlternativeSource = 'stockanalysis';
      } else {
        errMsg = specific_year ? `No data found for year ${specific_year}` : 'No annual financial data found in SEC XBRL';
      }

      if (job) await supabase.from('import_jobs').update({ status: 'failed' as const, finished_at: new Date().toISOString(), error_details: errMsg }).eq('id', job.id);
      return new Response(JSON.stringify({ success: false, error: errMsg, suggest_alternative_source: suggestAlternativeSource }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const importedYears: number[] = [];
    const updatedYears: number[] = [];
    const skippedYears: number[] = [];
    const logs: string[] = [];

    for (const [fy, items] of Array.from(yearData.entries()).sort((a, b) => a[0] - b[0])) {
      const checksum = computeChecksum(items);
      const existing = existingYearMap.get(fy);

      // Incremental: skip if checksum matches
      if (is_incremental && existing && existing.checksum === checksum) {
        skippedYears.push(fy);
        logs.push(`Ano ${fy} sem alterações`);
        console.log(`Year ${fy}: no changes (checksum match)`);
        continue;
      }

      const latestFiledDate = Array.from(items.values())
        .map((item) => item.filedDate)
        .filter((date): date is string => Boolean(date))
        .sort((a, b) => b.localeCompare(a))[0] || null;

      // Determine data_status: if few items, mark as partial
      const dataStatus = items.size < 5 ? 'draft' : 'imported';

      let yearId: string;
      if (existing) {
        yearId = existing.id;
        await supabase.from('financial_statement_years').update({
          source_type: 'SEC_XBRL' as const,
          import_method: specific_year ? ('manual_entry' as const) : ('auto_sec' as const),
          data_status: dataStatus as any,
          source_url: factsUrl,
          filing_type: '10-K',
          filing_date: latestFiledDate,
          checksum,
          updated_at: new Date().toISOString(),
        }).eq('id', yearId);
        updatedYears.push(fy);
        logs.push(`Ano ${fy} atualizado`);
        console.log(`Year ${fy}: updated (checksum changed)`);
      } else {
        const { data: newYear, error: yearErr } = await supabase
          .from('financial_statement_years').insert({
            company_id: companyId, fiscal_year: fy,
            source_type: 'SEC_XBRL' as const,
            import_method: specific_year ? ('manual_entry' as const) : ('auto_sec' as const),
            data_status: dataStatus as any,
            source_url: factsUrl, filing_type: '10-K', filing_date: latestFiledDate, checksum,
          }).select().single();
        if (yearErr) { console.error(`Failed year ${fy}:`, yearErr); logs.push(`Ano ${fy} falhou: ${yearErr.message}`); continue; }
        yearId = newYear!.id;
        importedYears.push(fy);
        logs.push(`Novo ano encontrado: ${fy}`);
        console.log(`Year ${fy}: new (inserted)`);
      }

      // Upsert line items
      for (const [normalizedKey, fact] of items.entries()) {
        const mapping = XBRL_MAPPINGS[normalizedKey];
        await supabase.from('financial_line_items').upsert({
          statement_year_id: yearId, normalized_key: normalizedKey,
          statement_type: (mapping?.statementType || 'income_statement') as any,
          raw_value: fact.value, normalized_value: fact.value,
          source_label: fact.sourceTag, source_type: 'SEC_XBRL' as const,
          confidence_score: 1.0,
          unit: normalizedKey === 'shares_outstanding' ? 'shares' : (normalizedKey.startsWith('eps') ? 'USD/share' : 'USD'),
          source_reference: fact.endDate,
        }, { onConflict: 'statement_year_id,normalized_key' });
      }

      // Calculate FCF
      const ocf = items.get('operating_cash_flow');
      const capex = items.get('capital_expenditures');
      if (ocf && capex) {
        const fcf = ocf.value - Math.abs(capex.value);
        await supabase.from('financial_line_items').upsert({
          statement_year_id: yearId, normalized_key: 'free_cash_flow',
          statement_type: 'cash_flow' as any, raw_value: fcf, normalized_value: fcf,
          source_label: 'Calculated: OCF - |CapEx|', source_type: 'SEC_XBRL' as const,
          confidence_score: 0.95, unit: 'USD', source_reference: latestFiledDate,
        }, { onConflict: 'statement_year_id,normalized_key' });
      }
    }

    // Detect missing years (in source but not imported)
    const missingYears = allAvailableYears.filter(y => !existingYearMap.has(y) && !importedYears.includes(y));

    await supabase.from('companies').update({
      last_imported_at: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString(),
    }).eq('id', companyId);

    const allProcessed = [...importedYears, ...updatedYears].sort();
    const logSummary = logs.join('; ');

    if (job) {
      await supabase.from('import_jobs').update({
        status: 'completed' as const, finished_at: new Date().toISOString(),
        years_imported: allProcessed, log_summary: logSummary,
      }).eq('id', job.id);
    }

    console.log(`SEC import complete: ${importedYears.length} new, ${updatedYears.length} updated, ${skippedYears.length} skipped`);

    return new Response(JSON.stringify({
      success: true, company_id: companyId, ticker: ticker.toUpperCase(), name: cikResult.name,
      years_imported: importedYears.sort(), years_updated: updatedYears.sort(),
      years_skipped: skippedYears.sort(), years_available: allAvailableYears,
      missing_years: missingYears, logs, source: 'SEC_XBRL',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('SEC import error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
