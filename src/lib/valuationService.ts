import { supabase } from "@/integrations/supabase/client";

export async function saveBuffettValuation(ticker: string, inputs: unknown, result: unknown): Promise<void> {
  try {
    await supabase.from('valuation_results').upsert(
      {
        ticker: ticker.toUpperCase(),
        valuation_type: 'buffett',
        inputs: inputs as any,
        result: result as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'ticker,valuation_type' }
    );
  } catch (err) {
    console.error('Failed to save Buffett valuation to Supabase:', err);
  }
}

export async function getBuffettValuation(ticker: string): Promise<{ inputs: any; result: any } | null> {
  try {
    const { data, error } = await supabase
      .from('valuation_results')
      .select('inputs, result')
      .eq('ticker', ticker.toUpperCase())
      .eq('valuation_type', 'buffett')
      .maybeSingle();
    if (error || !data) return null;
    return { inputs: data.inputs, result: data.result };
  } catch (err) {
    console.error('Failed to load Buffett valuation from Supabase:', err);
    return null;
  }
}

export async function getAllBuffettValuations(): Promise<Record<string, any>> {
  try {
    const { data, error } = await supabase
      .from('valuation_results')
      .select('ticker, result')
      .eq('valuation_type', 'buffett');
    if (error || !data) return {};
    const map: Record<string, any> = {};
    for (const row of data) {
      if (row.result) map[row.ticker] = row.result;
    }
    return map;
  } catch (err) {
    console.error('Failed to load Buffett valuations from Supabase:', err);
    return {};
  }
}
