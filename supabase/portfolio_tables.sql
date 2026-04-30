-- ============================================================
-- PORTFOLIO TABLES
-- Run this in: Supabase Dashboard → SQL Editor
-- Project: https://hyecidvpvfhdulpbkuxg.supabase.co
-- ============================================================

-- portfolio_transactions
CREATE TABLE public.portfolio_transactions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker          TEXT        NOT NULL,
  company_id      UUID        REFERENCES public.companies(id) ON DELETE SET NULL,
  type            TEXT        NOT NULL CHECK (type IN ('buy', 'sell')),
  date            DATE        NOT NULL,
  price_per_share NUMERIC     NOT NULL CHECK (price_per_share >= 0),
  quantity        NUMERIC     NOT NULL CHECK (quantity > 0),
  currency        TEXT        NOT NULL DEFAULT 'USD',
  fees            NUMERIC     NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pt_ticker ON public.portfolio_transactions (ticker);
CREATE INDEX idx_pt_date   ON public.portfolio_transactions (date);

CREATE TRIGGER update_pt_updated_at
  BEFORE UPDATE ON public.portfolio_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- portfolio_dividends
CREATE TABLE public.portfolio_dividends (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker           TEXT        NOT NULL,
  company_id       UUID        REFERENCES public.companies(id) ON DELETE SET NULL,
  date             DATE        NOT NULL,
  amount_per_share NUMERIC     NOT NULL CHECK (amount_per_share >= 0),
  quantity         NUMERIC     NOT NULL CHECK (quantity > 0),
  currency         TEXT        NOT NULL DEFAULT 'USD',
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pd_ticker ON public.portfolio_dividends (ticker);
CREATE INDEX idx_pd_date   ON public.portfolio_dividends (date);

CREATE TRIGGER update_pd_updated_at
  BEFORE UPDATE ON public.portfolio_dividends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.portfolio_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_dividends    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read portfolio_transactions"   ON public.portfolio_transactions FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert portfolio_transactions" ON public.portfolio_transactions FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update portfolio_transactions" ON public.portfolio_transactions FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete portfolio_transactions" ON public.portfolio_transactions FOR DELETE TO anon        USING (true);

CREATE POLICY "Auth can read portfolio_transactions"   ON public.portfolio_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert portfolio_transactions" ON public.portfolio_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update portfolio_transactions" ON public.portfolio_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete portfolio_transactions" ON public.portfolio_transactions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Anon can read portfolio_dividends"   ON public.portfolio_dividends FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert portfolio_dividends" ON public.portfolio_dividends FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update portfolio_dividends" ON public.portfolio_dividends FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete portfolio_dividends" ON public.portfolio_dividends FOR DELETE TO anon        USING (true);

CREATE POLICY "Auth can read portfolio_dividends"   ON public.portfolio_dividends FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert portfolio_dividends" ON public.portfolio_dividends FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update portfolio_dividends" ON public.portfolio_dividends FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete portfolio_dividends" ON public.portfolio_dividends FOR DELETE TO authenticated USING (true);
