const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function parseNumber(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$%,]/g, '').replace(/\((.+)\)/, '-$1').trim();
  if (cleaned === '-' || cleaned === 'N/A' || cleaned === '') return null;
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

function getYearColumns(rows: Map<string, string[]>): { years: number[], indices: number[] } {
  const fyRow = rows.get('Fiscal Year') || rows.get('Period Ending');
  if (!fyRow) return { years: [], indices: [] };
  
  const years: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < fyRow.length; i++) {
    const match = fyRow[i].match(/(?:FY\s+)?(\d{4})/);
    if (match) {
      years.push(parseInt(match[1]));
      indices.push(i);
    }
  }
  return { years, indices };
}

function getVal(rows: Map<string, string[]>, label: string, colIdx: number): number | null {
  const row = rows.get(label);
  if (!row || colIdx >= row.length) return null;
  return parseNumber(row[colIdx]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine base URL for StockAnalysis - we need income statement, balance sheet, and cash flow
    let baseUrl = url.trim().replace(/\/$/, '');
    
    // Detect SEC.gov URLs and redirect user
    if (baseUrl.includes('sec.gov')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Links do SEC.gov usam formato iXBRL dinâmico que não é possível extrair diretamente. Por favor, usa o link do StockAnalysis. Exemplo: https://stockanalysis.com/stocks/aapl/financials/' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If URL is the main financials page, build URLs for each section
    const isStockAnalysis = baseUrl.includes('stockanalysis.com');
    
    const urls: string[] = [];
    if (isStockAnalysis) {
      // Extract the stock path
      const match = baseUrl.match(/(https:\/\/stockanalysis\.com\/stocks\/[^/]+)/);
      const stockBase = match ? match[1] : baseUrl;
      urls.push(`${stockBase}/financials/`);           // Income Statement
      urls.push(`${stockBase}/financials/balance-sheet/`); // Balance Sheet
      urls.push(`${stockBase}/financials/cash-flow-statement/`); // Cash Flow
    } else {
      urls.push(baseUrl);
    }

    console.log('Scraping URLs:', urls);

    // Scrape all pages
    const allMarkdown: string[] = [];
    for (const scrapeUrl of urls) {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: scrapeUrl,
          formats: ['markdown'],
          onlyMainContent: true,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        const md = data.data?.markdown || data.markdown || '';
        allMarkdown.push(md);
      }
    }

    const fullMarkdown = allMarkdown.join('\n\n---SECTION---\n\n');
    
    if (fullMarkdown.length < 200) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract content from the pages.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse tables from each section
    const incomeRows = extractTableRows(allMarkdown[0] || '');
    const balanceRows = allMarkdown[1] ? extractTableRows(allMarkdown[1]) : new Map();
    const cashFlowRows = allMarkdown[2] ? extractTableRows(allMarkdown[2]) : new Map();

    // Get year columns from income statement
    const { years, indices } = getYearColumns(incomeRows);
    console.log('Found years:', years, 'at indices:', indices);

    if (years.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not find year columns in the financial tables. Try a StockAnalysis financials page.',
          rawMarkdown: fullMarkdown.substring(0, 3000),
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the most recent fiscal year (first in the years array)
    const year = years[0];
    const targetIdx = indices[0];
    
    // Income Statement data
    const revenue = getVal(incomeRows, 'Revenue', targetIdx);
    const grossProfit = getVal(incomeRows, 'Gross Profit', targetIdx);
    const operatingIncome = getVal(incomeRows, 'Operating Income', targetIdx);
    const netIncome = getVal(incomeRows, 'Net Income', targetIdx) || getVal(incomeRows, 'Net Income to Common', targetIdx);
    const sharesOutstanding = getVal(incomeRows, 'Shares Outstanding (Diluted)', targetIdx) || getVal(incomeRows, 'Shares Outstanding (Basic)', targetIdx);
    const sga = getVal(incomeRows, 'Selling, General & Admin', targetIdx);
    const rd = getVal(incomeRows, 'Research & Development', targetIdx);

    // Balance Sheet data
    const bsResult = getYearColumns(balanceRows);
    let bsIdx = 0;
    for (let i = 0; i < bsResult.years.length; i++) {
      if (bsResult.years[i] === year) { bsIdx = bsResult.indices[i]; break; }
    }
    
    const totalDebt = getVal(balanceRows, 'Total Debt', bsIdx) || getVal(balanceRows, 'Long-Term Debt', bsIdx);
    const totalEquity = getVal(balanceRows, "Shareholders' Equity", bsIdx) || getVal(balanceRows, 'Total Equity', bsIdx);
    const totalCurrentAssets = getVal(balanceRows, 'Total Current Assets', bsIdx);
    const totalCurrentLiabilities = getVal(balanceRows, 'Total Current Liabilities', bsIdx);
    const bookValue = getVal(balanceRows, 'Book Value Per Share', bsIdx);

    // Cash Flow data
    const cfResult = getYearColumns(cashFlowRows);
    let cfIdx = 0;
    for (let i = 0; i < cfResult.years.length; i++) {
      if (cfResult.years[i] === year) { cfIdx = cfResult.indices[i]; break; }
    }
    
    const operatingCF = getVal(cashFlowRows, 'Operating Cash Flow', cfIdx);
    const capex = getVal(cashFlowRows, 'Capital Expenditures', cfIdx);
    const fcf = getVal(cashFlowRows, 'Free Cash Flow', cfIdx) || 
      (operatingCF && capex ? operatingCF + capex : null); // capex is usually negative
    const dividendsTotal = getVal(cashFlowRows, 'Dividends Paid', cfIdx);

    // Calculate derived metrics
    const grossMargin = revenue && grossProfit ? (grossProfit / revenue) * 100 : null;
    const netMargin = revenue && netIncome ? (netIncome / revenue) * 100 : null;
    const operatingMargin = revenue && operatingIncome ? (operatingIncome / revenue) * 100 : null;
    const roe = totalEquity && netIncome ? (netIncome / totalEquity) * 100 : null;
    const debtToEquity = totalEquity && totalDebt ? totalDebt / totalEquity : null;
    const currentRatio = totalCurrentAssets && totalCurrentLiabilities ? totalCurrentAssets / totalCurrentLiabilities : null;
    const sgaToRevenue = revenue && sga ? (sga / revenue) * 100 : null;
    const rdToRevenue = revenue && rd ? (rd / revenue) * 100 : null;
    const eps = netIncome && sharesOutstanding ? netIncome / sharesOutstanding : null;
    const dividendsPerShare = dividendsTotal && sharesOutstanding ? Math.abs(dividendsTotal) / sharesOutstanding : null;
    const payoutRatio = netIncome && dividendsTotal ? (Math.abs(dividendsTotal) / netIncome) * 100 : null;

    const result = {
      year,
      revenue: revenue || 0,
      revenueGrowth: null,
      grossProfit: grossProfit || 0,
      grossMargin: grossMargin || 0,
      operatingIncome: operatingIncome || 0,
      ebitGrowth: null,
      netIncome: netIncome || 0,
      netIncomeGrowth: null,
      eps: eps || 0,
      epsGrowth: null,
      fcf: fcf || 0,
      fcfGrowth: null,
      roe: roe || 0,
      netMargin: netMargin || 0,
      operatingMargin: operatingMargin || 0,
      sgaToRevenue: sgaToRevenue || 0,
      rdToRevenue: rdToRevenue || 0,
      debtToEquity: debtToEquity || 0,
      currentRatio: currentRatio || 0,
      bookValuePerShare: bookValue || 0,
      bookValueGrowth: null,
      sharesOutstanding: sharesOutstanding || 0,
      dividends: dividendsPerShare || 0,
      payoutRatio: payoutRatio || 0,
    };

    console.log('Extracted data for year:', year, JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error parsing 10-K:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
