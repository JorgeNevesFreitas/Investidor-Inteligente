import { supabase } from "@/integrations/supabase/client";

export interface PriceAlert {
  id: string;
  ticker: string;
  company_id: string | null;
  company_name: string | null;
  alert_type: "above" | "below" | null;
  target_price: number | null;
  currency: string;
  is_active: boolean;
  triggered: boolean;
  triggered_at: string | null;
  created_at: string;
  alert_category: 'manual' | 'auto_invest' | 'auto_atento' | 'auto_aguardar';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("price_alerts");

export async function fetchAlertsForTicker(ticker: string): Promise<PriceAlert[]> {
  const { data, error } = await table()
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((a: PriceAlert) => ({
    ...a,
    alert_category: a.alert_category ?? 'manual',
  }));
}

export async function fetchActiveAlertsForTickers(tickers: string[]): Promise<PriceAlert[]> {
  if (tickers.length === 0) return [];
  const { data, error } = await table()
    .select("*")
    .in("ticker", [...new Set(tickers.map(t => t.toUpperCase()))])
    .eq("is_active", true)
    .eq("triggered", false)
    .not("alert_type", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((a: PriceAlert) => ({
    ...a,
    alert_category: a.alert_category ?? 'manual',
  }));
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
      ticker:         opts.ticker.toUpperCase(),
      company_id:     opts.companyId,
      company_name:   opts.companyName,
      alert_type:     opts.alertType,
      target_price:   opts.targetPrice,
      currency:       opts.currency,
      is_active:      true,
      triggered:      false,
      alert_category: 'manual',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function upsertAutoAlert(opts: {
  ticker: string;
  companyId: string | null;
  companyName: string | null;
  category: 'auto_invest' | 'auto_atento' | 'auto_aguardar';
  isActive: boolean;
}): Promise<PriceAlert> {
  const { data: existing } = await table()
    .select("id")
    .eq("ticker", opts.ticker.toUpperCase())
    .eq("alert_category", opts.category)
    .maybeSingle();

  if (existing) {
    const { data, error } = await table()
      .update({ is_active: opts.isActive, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await table()
    .insert({
      ticker:         opts.ticker.toUpperCase(),
      company_id:     opts.companyId,
      company_name:   opts.companyName,
      alert_category: opts.category,
      alert_type:     null,
      target_price:   null,
      currency:       'USD',
      is_active:      opts.isActive,
      triggered:      false,
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
