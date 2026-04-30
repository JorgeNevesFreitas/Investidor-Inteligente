import { supabase } from "@/integrations/supabase/client";
import { DCFInputs, DCFResult } from "./calculations";

export interface SavedDCFValuation {
  ticker: string;
  company_id: string | null;
  inputs: DCFInputs;
  result: DCFResult;
  price_at_calculation: number | null;
  calculated_at: string;
}

function toSaved(row: Record<string, unknown>): SavedDCFValuation {
  return {
    ticker: row.ticker as string,
    company_id: (row.company_id as string | null) ?? null,
    inputs: row.inputs as unknown as DCFInputs,
    result: row.result as unknown as DCFResult,
    price_at_calculation: (row.price_at_calculation as number | null) ?? null,
    calculated_at: row.calculated_at as string,
  };
}

export async function saveDCFValuation(
  ticker: string,
  companyId: string | null,
  inputs: DCFInputs,
  result: DCFResult,
  priceAtCalculation: number | null
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("dcf_valuations").upsert(
    {
      ticker,
      company_id: companyId,
      method: inputs.method,
      inputs: inputs as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      price_at_calculation: priceAtCalculation,
      calculated_at: now,
      updated_at: now,
    },
    { onConflict: "ticker" }
  );
  if (error) console.error("[DCF] save error:", error.message);
}

export async function getDCFValuation(ticker: string): Promise<SavedDCFValuation | null> {
  const { data, error } = await supabase
    .from("dcf_valuations")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();
  if (error || !data) return null;
  return toSaved(data as unknown as Record<string, unknown>);
}

export async function getAllDCFValuations(): Promise<SavedDCFValuation[]> {
  const { data, error } = await supabase.from("dcf_valuations").select("*");
  if (error || !data) return [];
  return data.map(d => toSaved(d as unknown as Record<string, unknown>));
}
