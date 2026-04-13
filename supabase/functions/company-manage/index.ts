import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { company_id, action } = body;

    if (!company_id) {
      return new Response(JSON.stringify({ success: false, error: 'company_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete_company') {
      // Delete line items first
      const { data: years } = await supabase
        .from('financial_statement_years')
        .select('id')
        .eq('company_id', company_id);

      if (years && years.length > 0) {
        const yearIds = years.map((y: any) => y.id);
        await supabase.from('financial_line_items').delete().in('statement_year_id', yearIds);
      }

      // Delete financial years
      await supabase.from('financial_statement_years').delete().eq('company_id', company_id);

      // Delete import jobs
      await supabase.from('import_jobs').delete().eq('company_id', company_id);

      // Delete company
      const { error } = await supabase.from('companies').delete().eq('id', company_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('company-manage error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
