-- ============================================================
-- PORTFOLIO: MEMBROS, BROKERS, LIQUIDEZ
-- Correr no Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Adicionar coluna broker às tabelas existentes
--    (DEFAULT 'IBKR' para registos já existentes)
ALTER TABLE public.portfolio_transactions
  ADD COLUMN IF NOT EXISTS broker TEXT NOT NULL DEFAULT 'IBKR';

ALTER TABLE public.portfolio_dividends
  ADD COLUMN IF NOT EXISTS broker TEXT NOT NULL DEFAULT 'IBKR';

-- 2. Membros da carteira (pré-definidos, imutáveis)
CREATE TABLE IF NOT EXISTS public.portfolio_members (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.portfolio_members (name)
VALUES ('V&J'), ('Dinis'), ('Mariana')
ON CONFLICT (name) DO NOTHING;

-- 3. Movimentos de liquidez
--    amount: positivo = entrada (depósito, venda, dividendo)
--            negativo = saída  (levantamento, compra)
CREATE TABLE IF NOT EXISTS public.portfolio_cash (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date       DATE        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('deposit','withdrawal','dividend','buy','sell')),
  ticker     TEXT,
  amount     NUMERIC     NOT NULL,
  currency   TEXT        NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR','USD')),
  broker     TEXT        NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_date   ON public.portfolio_cash (date);
CREATE INDEX IF NOT EXISTS idx_pc_broker ON public.portfolio_cash (broker);
CREATE INDEX IF NOT EXISTS idx_pc_type   ON public.portfolio_cash (type);
CREATE INDEX IF NOT EXISTS idx_pc_ticker ON public.portfolio_cash (ticker);

CREATE TRIGGER update_pc_updated_at
  BEFORE UPDATE ON public.portfolio_cash
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Repartição de liquidez por membro
CREATE TABLE IF NOT EXISTS public.portfolio_cash_members (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_id    UUID        NOT NULL REFERENCES public.portfolio_cash(id) ON DELETE CASCADE,
  member_id  UUID        NOT NULL REFERENCES public.portfolio_members(id) ON DELETE CASCADE,
  amount     NUMERIC     NOT NULL,
  percentage NUMERIC     NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cash_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_pcm_cash_id   ON public.portfolio_cash_members (cash_id);
CREATE INDEX IF NOT EXISTS idx_pcm_member_id ON public.portfolio_cash_members (member_id);

-- 5. RLS
ALTER TABLE public.portfolio_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_cash         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_cash_members ENABLE ROW LEVEL SECURITY;

-- portfolio_members: só leitura (registos inseridos manualmente acima)
CREATE POLICY "Anon can read portfolio_members"  ON public.portfolio_members FOR SELECT TO anon        USING (true);
CREATE POLICY "Auth can read portfolio_members"  ON public.portfolio_members FOR SELECT TO authenticated USING (true);

-- portfolio_cash
CREATE POLICY "Anon can read portfolio_cash"     ON public.portfolio_cash FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert portfolio_cash"   ON public.portfolio_cash FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update portfolio_cash"   ON public.portfolio_cash FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete portfolio_cash"   ON public.portfolio_cash FOR DELETE TO anon        USING (true);
CREATE POLICY "Auth can read portfolio_cash"     ON public.portfolio_cash FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert portfolio_cash"   ON public.portfolio_cash FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update portfolio_cash"   ON public.portfolio_cash FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete portfolio_cash"   ON public.portfolio_cash FOR DELETE TO authenticated USING (true);

-- portfolio_cash_members
CREATE POLICY "Anon can read portfolio_cash_members"   ON public.portfolio_cash_members FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert portfolio_cash_members" ON public.portfolio_cash_members FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can delete portfolio_cash_members" ON public.portfolio_cash_members FOR DELETE TO anon        USING (true);
CREATE POLICY "Auth can read portfolio_cash_members"   ON public.portfolio_cash_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert portfolio_cash_members" ON public.portfolio_cash_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can delete portfolio_cash_members" ON public.portfolio_cash_members FOR DELETE TO authenticated USING (true);
