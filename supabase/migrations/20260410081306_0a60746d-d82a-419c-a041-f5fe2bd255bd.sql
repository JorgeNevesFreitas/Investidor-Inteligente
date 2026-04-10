
-- Create enum types
CREATE TYPE public.region_type AS ENUM ('US', 'NON_US');
CREATE TYPE public.statement_type AS ENUM ('income_statement', 'balance_sheet', 'cash_flow');
CREATE TYPE public.source_type AS ENUM ('SEC_XBRL', 'SEC_FILING_FALLBACK', 'STOCKANALYSIS_LINK', 'STOCKANALYSIS_AUTO', 'MANUAL');
CREATE TYPE public.import_method AS ENUM ('auto_sec', 'auto_stockanalysis', 'manual_link', 'manual_entry');
CREATE TYPE public.job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'partial');
CREATE TYPE public.job_type AS ENUM ('import', 'refresh', 'import_from_stockanalysis_link');
CREATE TYPE public.data_status AS ENUM ('draft', 'imported', 'verified', 'stale');

-- Companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  exchange TEXT,
  country TEXT,
  sector TEXT,
  currency TEXT DEFAULT 'USD',
  region_type public.region_type NOT NULL DEFAULT 'US',
  cik TEXT,
  sec_enabled BOOLEAN DEFAULT false,
  stockanalysis_url TEXT,
  primary_data_source TEXT,
  current_price NUMERIC,
  market_cap NUMERIC,
  pe_ratio NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_imported_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_companies_ticker_exchange ON public.companies (ticker, exchange);
CREATE INDEX idx_companies_ticker ON public.companies (ticker);
CREATE INDEX idx_companies_cik ON public.companies (cik) WHERE cik IS NOT NULL;

-- Financial statement years table
CREATE TABLE public.financial_statement_years (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'annual',
  currency TEXT DEFAULT 'USD',
  filing_type TEXT,
  filing_date DATE,
  source_type public.source_type,
  source_url TEXT,
  import_method public.import_method,
  data_status public.data_status DEFAULT 'imported',
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, fiscal_year)
);

CREATE INDEX idx_fsy_company ON public.financial_statement_years (company_id);
CREATE INDEX idx_fsy_year ON public.financial_statement_years (company_id, fiscal_year);

-- Financial line items table
CREATE TABLE public.financial_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_year_id UUID NOT NULL REFERENCES public.financial_statement_years(id) ON DELETE CASCADE,
  statement_type public.statement_type NOT NULL,
  normalized_key TEXT NOT NULL,
  source_label TEXT,
  raw_value NUMERIC,
  normalized_value NUMERIC,
  unit TEXT DEFAULT 'USD',
  confidence_score NUMERIC DEFAULT 1.0,
  source_type public.source_type,
  source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(statement_year_id, normalized_key)
);

CREATE INDEX idx_fli_year ON public.financial_line_items (statement_year_id);
CREATE INDEX idx_fli_key ON public.financial_line_items (normalized_key);

-- Import jobs table
CREATE TABLE public.import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_type public.job_type NOT NULL,
  source_type public.source_type,
  status public.job_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  years_imported INTEGER[],
  log_summary TEXT,
  error_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ij_company ON public.import_jobs (company_id);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_statement_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Public read access for all authenticated users
CREATE POLICY "Anyone can read companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update companies" ON public.companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can read financial years" ON public.financial_statement_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert financial years" ON public.financial_statement_years FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update financial years" ON public.financial_statement_years FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can read line items" ON public.financial_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert line items" ON public.financial_line_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update line items" ON public.financial_line_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can read import jobs" ON public.import_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert import jobs" ON public.import_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update import jobs" ON public.import_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Also allow anon access since the app doesn't have auth yet
CREATE POLICY "Anon can read companies" ON public.companies FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert companies" ON public.companies FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update companies" ON public.companies FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read financial years" ON public.financial_statement_years FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert financial years" ON public.financial_statement_years FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update financial years" ON public.financial_statement_years FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read line items" ON public.financial_line_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert line items" ON public.financial_line_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update line items" ON public.financial_line_items FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read import jobs" ON public.import_jobs FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert import jobs" ON public.import_jobs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update import jobs" ON public.import_jobs FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fsy_updated_at BEFORE UPDATE ON public.financial_statement_years FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fli_updated_at BEFORE UPDATE ON public.financial_line_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
