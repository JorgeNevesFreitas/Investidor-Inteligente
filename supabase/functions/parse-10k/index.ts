import { corsHeaders } from '@supabase/supabase-js/cors'

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

    console.log('Scraping 10-K URL:', url);

    // Step 1: Scrape the 10-K page
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url.trim(),
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok) {
      console.error('Firecrawl error:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: scrapeData.error || 'Failed to scrape page' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';

    if (!markdown || markdown.length < 500) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract enough content from the page. Try a different URL or the direct SEC filing page.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Use Firecrawl's JSON extraction to parse financial data
    const extractResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url.trim(),
        formats: [
          {
            type: 'json',
            prompt: `Extract the annual financial data from this 10-K filing. Find the most recent fiscal year data. Return a single object with these fields (all monetary values in millions USD):
- year (number, e.g. 2025)
- revenue (number, total revenue/net sales in millions)
- grossProfit (number, in millions)
- grossMargin (number, percentage e.g. 46.2)
- operatingIncome (number, in millions)
- netIncome (number, in millions)
- eps (number, diluted EPS)
- fcf (number, free cash flow = operating cash flow minus capex, in millions)
- roe (number, percentage)
- netMargin (number, percentage)
- operatingMargin (number, percentage)
- sgaToRevenue (number, percentage of SGA to revenue)
- rdToRevenue (number, percentage of R&D to revenue)
- debtToEquity (number, ratio e.g. 1.87)
- currentRatio (number, ratio)
- bookValuePerShare (number, in dollars)
- sharesOutstanding (number, diluted shares in millions)
- dividends (number, dividends per share in dollars)
- payoutRatio (number, percentage)

If you cannot find a specific value, use null.`,
            schema: {
              type: 'object',
              properties: {
                year: { type: 'number' },
                revenue: { type: 'number' },
                grossProfit: { type: 'number' },
                grossMargin: { type: 'number' },
                operatingIncome: { type: 'number' },
                netIncome: { type: 'number' },
                eps: { type: 'number' },
                fcf: { type: 'number' },
                roe: { type: 'number' },
                netMargin: { type: 'number' },
                operatingMargin: { type: 'number' },
                sgaToRevenue: { type: 'number' },
                rdToRevenue: { type: 'number' },
                debtToEquity: { type: 'number' },
                currentRatio: { type: 'number' },
                bookValuePerShare: { type: 'number' },
                sharesOutstanding: { type: 'number' },
                dividends: { type: 'number' },
                payoutRatio: { type: 'number' },
              },
            },
          },
        ],
      }),
    });

    const extractData = await extractResponse.json();

    if (!extractResponse.ok) {
      console.error('Extraction error:', extractData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to extract financial data. The page may not contain structured financial tables.',
          rawMarkdown: markdown.substring(0, 2000),
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const financialData = extractData.data?.json || extractData.json || null;

    if (!financialData || !financialData.year) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not parse financial data from this document. Try using StockAnalysis or Macrotrends page for this company instead.',
          rawMarkdown: markdown.substring(0, 2000),
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate growth rates (will be null since we only have one year)
    const result = {
      ...financialData,
      revenueGrowth: null,
      ebitGrowth: null,
      netIncomeGrowth: null,
      epsGrowth: null,
      fcfGrowth: null,
      bookValueGrowth: null,
    };

    console.log('Successfully extracted financial data for year:', result.year);

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
