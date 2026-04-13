import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get('ticker')?.toUpperCase();

    if (!ticker) {
      return new Response(JSON.stringify({ success: false, error: 'ticker required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Try Yahoo Finance v8 API (no key needed)
    let price: number | null = null;
    let currency = 'USD';
    let source = '';

    try {
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
      const resp = await fetch(yahooUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (resp.ok) {
        const data = await resp.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          price = meta.regularMarketPrice;
          currency = meta.currency || 'USD';
          source = 'yahoo_finance';
        }
      }
    } catch (e) {
      console.error('Yahoo Finance failed:', e);
    }

    // Fallback: try Google Finance scraping via a simple approach
    if (price === null) {
      try {
        const gUrl = `https://www.google.com/finance/quote/${ticker}:NASDAQ`;
        const resp = await fetch(gUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (resp.ok) {
          const html = await resp.text();
          // Look for the price in data-last-price attribute
          const match = html.match(/data-last-price="([0-9.]+)"/);
          if (match) {
            price = parseFloat(match[1]);
            source = 'google_finance';
          }
        }
      } catch (e) {
        console.error('Google Finance fallback failed:', e);
      }
    }

    if (price === null || isNaN(price) || price <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Price unavailable',
        ticker,
        status: 'unavailable',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Save to DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from('companies')
      .update({ current_price: price, currency })
      .eq('ticker', ticker);

    return new Response(JSON.stringify({
      success: true,
      ticker,
      price,
      currency,
      source,
      timestamp: new Date().toISOString(),
      status: 'success',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('market-price error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
