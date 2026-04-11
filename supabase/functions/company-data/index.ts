import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'get';

    if (req.method === 'GET' || action === 'get') {
      const ticker = url.searchParams.get('ticker');
      const companyId = url.searchParams.get('company_id');

      if (!ticker && !companyId) {
        return new Response(JSON.stringify({ success: false, error: 'ticker or company_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let companyQuery = supabase.from('companies').select('*');
      if (companyId) {
        companyQuery = companyQuery.eq('id', companyId);
      } else {
        companyQuery = companyQuery
          .eq('ticker', ticker!.toUpperCase())
          .order('last_imported_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false });
      }

      const { data: companyRows, error: companyErr } = await companyQuery.limit(1);
      if (companyErr) throw companyErr;

      const company = companyRows?.[0] || null;

      if (!company) {
        return new Response(JSON.stringify({ success: true, company: null, financials: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: years, error: yearsErr } = await supabase
        .from('financial_statement_years')
        .select('*, financial_line_items(*)')
        .eq('company_id', company.id)
        .order('fiscal_year', { ascending: true });

      if (yearsErr) throw yearsErr;

      const { data: imports } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(10);

      return new Response(JSON.stringify({
        success: true,
        company,
        financials: years || [],
        import_history: imports || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'search') {
      const body = await req.json();
      const searchTicker = body.ticker?.toUpperCase();

      if (!searchTicker) {
        return new Response(JSON.stringify({ success: false, error: 'ticker required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: dbResults } = await supabase
        .from('companies')
        .select('id, ticker, name, exchange, region_type, last_imported_at, stockanalysis_url')
        .ilike('ticker', `%${searchTicker}%`)
        .order('last_imported_at', { ascending: false, nullsFirst: false })
        .limit(10);

      return new Response(JSON.stringify({
        success: true,
        results: dbResults || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list') {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, ticker, name, exchange, sector, currency, region_type, current_price, market_cap, pe_ratio, last_imported_at, last_refreshed_at, primary_data_source')
        .order('updated_at', { ascending: false });

      return new Response(JSON.stringify({
        success: true,
        companies: companies || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('company-data error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});