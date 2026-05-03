import { supabase } from "@/integrations/supabase/client";

export interface PriceAlert {
  id: string;
  ticker: string;
  company_id: string | null;
  company_name: string | null;
  alert_type: "above" | "below";
  target_price: number;
  currency: string;
  is_active: boolean;
  triggered: boolean;
  triggered_at: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("price_alerts");

export async function fetchAlertsForTicker(ticker: string): Promise<PriceAlert[]> {
  const { data, error } = await table()
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPriceAlert(opts: {
  ticker: string;
  companyId: string | null;
  companyName: string | null;
  alertType: "above" | "below";
  targetPrice: number;
  currency: string;
}): Promise<PriceAlert> {
  const { data, error } = await table()
    .insert({
      ticker:       opts.ticker.toUpperCase(),
      company_id:   opts.companyId,
      company_name: opts.companyName,
      alert_type:   opts.alertType,
      target_price: opts.targetPrice,
      currency:     opts.currency,
      is_active:    true,
      triggered:    false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function togglePriceAlert(id: string, isActive: boolean): Promise<void> {
  const { error } = await table()
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deletePriceAlert(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw new Error(error.message);
}
