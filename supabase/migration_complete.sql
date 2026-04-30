-- ============================================================
-- INVESTIDOR INTELIGENTE — Script de migração completo
-- Destino: https://hyecidvpvfhdulpbkuxg.supabase.co
-- Gerado em: 2026-04-30
-- ============================================================
-- Corre este script no SQL Editor do novo projeto Supabase.
-- ============================================================


-- ============================================================
-- 1. TIPOS ENUM
-- ============================================================

CREATE TYPE public.region_type   AS ENUM ('US', 'NON_US');
CREATE TYPE public.statement_type AS ENUM ('income_statement', 'balance_sheet', 'cash_flow');
CREATE TYPE public.source_type   AS ENUM ('SEC_XBRL', 'SEC_FILING_FALLBACK', 'STOCKANALYSIS_LINK', 'STOCKANALYSIS_AUTO', 'MANUAL');
CREATE TYPE public.import_method AS ENUM ('auto_sec', 'auto_stockanalysis', 'manual_link', 'manual_entry');
CREATE TYPE public.job_status    AS ENUM ('pending', 'running', 'completed', 'failed', 'partial');
CREATE TYPE public.job_type      AS ENUM ('import', 'refresh', 'import_from_stockanalysis_link');
CREATE TYPE public.data_status   AS ENUM ('draft', 'imported', 'verified', 'stale');


-- ============================================================
-- 2. FUNÇÃO updated_at (necessária antes dos triggers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ============================================================
-- 3. TABELAS
-- ============================================================

-- companies
CREATE TABLE public.companies (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                 TEXT        NOT NULL,
  ticker               TEXT        NOT NULL,
  exchange             TEXT,
  country              TEXT,
  sector               TEXT,
  currency             TEXT        DEFAULT 'USD',
  region_type          public.region_type NOT NULL DEFAULT 'US',
  cik                  TEXT,
  sec_enabled          BOOLEAN     DEFAULT false,
  stockanalysis_url    TEXT,
  primary_data_source  TEXT,
  current_price        NUMERIC,
  market_cap           NUMERIC,
  pe_ratio             NUMERIC,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_imported_at     TIMESTAMPTZ,
  last_refreshed_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_companies_ticker_exchange ON public.companies (ticker, exchange);
CREATE INDEX idx_companies_ticker ON public.companies (ticker);
CREATE INDEX idx_companies_cik    ON public.companies (cik) WHERE cik IS NOT NULL;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- financial_statement_years
CREATE TABLE public.financial_statement_years (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year   INTEGER     NOT NULL,
  period_type   TEXT        NOT NULL DEFAULT 'annual',
  currency      TEXT        DEFAULT 'USD',
  filing_type   TEXT,
  filing_date   DATE,
  source_type   public.source_type,
  source_url    TEXT,
  import_method public.import_method,
  data_status   public.data_status DEFAULT 'imported',
  checksum      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, fiscal_year)
);

CREATE INDEX idx_fsy_company ON public.financial_statement_years (company_id);
CREATE INDEX idx_fsy_year    ON public.financial_statement_years (company_id, fiscal_year);

CREATE TRIGGER update_fsy_updated_at
  BEFORE UPDATE ON public.financial_statement_years
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- financial_line_items
CREATE TABLE public.financial_line_items (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_year_id UUID       NOT NULL REFERENCES public.financial_statement_years(id) ON DELETE CASCADE,
  statement_type   public.statement_type NOT NULL,
  normalized_key   TEXT        NOT NULL,
  source_label     TEXT,
  raw_value        NUMERIC,
  normalized_value NUMERIC,
  unit             TEXT        DEFAULT 'USD',
  confidence_score NUMERIC     DEFAULT 1.0,
  source_type      public.source_type,
  source_reference TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(statement_year_id, normalized_key)
);

CREATE INDEX idx_fli_year ON public.financial_line_items (statement_year_id);
CREATE INDEX idx_fli_key  ON public.financial_line_items (normalized_key);

CREATE TRIGGER update_fli_updated_at
  BEFORE UPDATE ON public.financial_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- import_jobs
CREATE TABLE public.import_jobs (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_type     public.job_type NOT NULL,
  source_type  public.source_type,
  status       public.job_status NOT NULL DEFAULT 'pending',
  started_at   TIMESTAMPTZ DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  years_imported INTEGER[],
  log_summary  TEXT,
  error_details TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ij_company ON public.import_jobs (company_id);


-- wishlist
CREATE TABLE public.wishlist (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker     TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  exchange   TEXT,
  notes      TEXT        DEFAULT '',
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticker)
);


-- dcf_valuations
CREATE TABLE public.dcf_valuations (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker                TEXT        NOT NULL,
  company_id            UUID        REFERENCES public.companies(id) ON DELETE SET NULL,
  method                TEXT        NOT NULL CHECK (method IN ('fcf', 'eps')),
  inputs                JSONB       NOT NULL,
  result                JSONB       NOT NULL,
  price_at_calculation  NUMERIC,
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticker)
);


-- ============================================================
-- 4. ROW LEVEL SECURITY — Activar em todas as tabelas
-- ============================================================

ALTER TABLE public.companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_statement_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_line_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dcf_valuations            ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. RLS POLICIES — companies
-- ============================================================

CREATE POLICY "Anon can read companies"   ON public.companies FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert companies" ON public.companies FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update companies" ON public.companies FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete companies" ON public.companies FOR DELETE TO anon        USING (true);

CREATE POLICY "Auth can read companies"   ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update companies" ON public.companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete companies" ON public.companies FOR DELETE TO authenticated USING (true);


-- ============================================================
-- 6. RLS POLICIES — financial_statement_years
-- ============================================================

CREATE POLICY "Anon can read financial years"   ON public.financial_statement_years FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert financial years" ON public.financial_statement_years FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update financial years" ON public.financial_statement_years FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete financial years" ON public.financial_statement_years FOR DELETE TO anon        USING (true);

CREATE POLICY "Auth can read financial years"   ON public.financial_statement_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert financial years" ON public.financial_statement_years FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update financial years" ON public.financial_statement_years FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete financial years" ON public.financial_statement_years FOR DELETE TO authenticated USING (true);


-- ============================================================
-- 7. RLS POLICIES — financial_line_items
-- ============================================================

CREATE POLICY "Anon can read line items"   ON public.financial_line_items FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert line items" ON public.financial_line_items FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update line items" ON public.financial_line_items FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete line items" ON public.financial_line_items FOR DELETE TO anon        USING (true);

CREATE POLICY "Auth can read line items"   ON public.financial_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert line items" ON public.financial_line_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update line items" ON public.financial_line_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete line items" ON public.financial_line_items FOR DELETE TO authenticated USING (true);


-- ============================================================
-- 8. RLS POLICIES — import_jobs
-- ============================================================

CREATE POLICY "Anon can read import jobs"   ON public.import_jobs FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert import jobs" ON public.import_jobs FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update import jobs" ON public.import_jobs FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete import jobs" ON public.import_jobs FOR DELETE TO anon        USING (true);

CREATE POLICY "Auth can read import jobs"   ON public.import_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert import jobs" ON public.import_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update import jobs" ON public.import_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete import jobs" ON public.import_jobs FOR DELETE TO authenticated USING (true);


-- ============================================================
-- 9. RLS POLICIES — wishlist
-- ============================================================

CREATE POLICY "Anon can read wishlist"   ON public.wishlist FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert wishlist" ON public.wishlist FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update wishlist" ON public.wishlist FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete wishlist" ON public.wishlist FOR DELETE TO anon        USING (true);

CREATE POLICY "Auth can read wishlist"   ON public.wishlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert wishlist" ON public.wishlist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update wishlist" ON public.wishlist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete wishlist" ON public.wishlist FOR DELETE TO authenticated USING (true);


-- ============================================================
-- 10. RLS POLICIES — dcf_valuations
-- ============================================================

CREATE POLICY "Anon can read dcf_valuations"   ON public.dcf_valuations FOR SELECT TO anon        USING (true);
CREATE POLICY "Anon can insert dcf_valuations" ON public.dcf_valuations FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "Anon can update dcf_valuations" ON public.dcf_valuations FOR UPDATE TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete dcf_valuations" ON public.dcf_valuations FOR DELETE TO anon        USING (true);

CREATE POLICY "Auth can read dcf_valuations"   ON public.dcf_valuations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert dcf_valuations" ON public.dcf_valuations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update dcf_valuations" ON public.dcf_valuations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete dcf_valuations" ON public.dcf_valuations FOR DELETE TO authenticated USING (true);


-- ============================================================
-- FIM DO SCRIPT DE ESTRUTURA
-- ============================================================
-- Os dados (INSERT statements) exporta-os directamente do
-- projecto antigo via:
--   Supabase Dashboard (antigo) → Table Editor → cada tabela
--   → botão "Export to CSV" no canto superior direito
--
-- Ou via pg_dump (se tiveres acesso às credenciais DB):
--   pg_dump "postgresql://postgres:[password]@db.xszachoyedoigzxejpnj.supabase.co:5432/postgres" \
--     --data-only --table=companies --table=financial_statement_years \
--     --table=financial_line_items --table=wishlist --table=dcf_valuations \
--     > data_export.sql
-- ============================================================
