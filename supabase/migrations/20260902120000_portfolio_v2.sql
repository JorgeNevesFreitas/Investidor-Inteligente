-- Portfolio v2: links de referência adicionais por empresa + snapshot diário da carteira
-- (TWR, MWR, Volatilidade, Max Drawdown, Sharpe, Beta)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS investing_url TEXT,
  ADD COLUMN IF NOT EXISTS ir_url TEXT;

CREATE TABLE IF NOT EXISTS public.portfolio_daily_snapshot (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date       DATE        NOT NULL UNIQUE,
  total_value_eur     NUMERIC     NOT NULL,   -- liquidez + valor investido
  total_invested_eur  NUMERIC     NOT NULL,   -- valor atual das posições
  total_cash_eur      NUMERIC     NOT NULL,
  eur_usd_rate        NUMERIC,
  benchmark_ticker    TEXT        NOT NULL DEFAULT '^GSPC',
  benchmark_close     NUMERIC,
  member_values       JSONB       NOT NULL DEFAULT '{}'::jsonb, -- { member_id: { value_eur, invested_eur, cash_eur } }
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pds_date ON public.portfolio_daily_snapshot (snapshot_date);

ALTER TABLE public.portfolio_daily_snapshot ENABLE ROW LEVEL SECURITY;

-- Só leitura para o cliente; a escrita é feita pela edge function portfolio-snapshot
-- com a service_role key (que ignora RLS), correndo diariamente via pg_cron.
CREATE POLICY "Anon can read portfolio_daily_snapshot" ON public.portfolio_daily_snapshot FOR SELECT TO anon        USING (true);
CREATE POLICY "Auth can read portfolio_daily_snapshot" ON public.portfolio_daily_snapshot FOR SELECT TO authenticated USING (true);
