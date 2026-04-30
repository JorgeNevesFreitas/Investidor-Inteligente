-- ── company_reports ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_reports (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker        TEXT        NOT NULL,
  company_id    UUID        REFERENCES public.companies(id) ON DELETE SET NULL,
  period_year   INTEGER     NOT NULL,
  period_month  INTEGER     CHECK (period_month BETWEEN 1 AND 12),
  report_date   DATE,
  title         TEXT        NOT NULL,
  content_html  TEXT,
  file_path     TEXT,
  file_type     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_reports_ticker_idx     ON public.company_reports(ticker);
CREATE INDEX IF NOT EXISTS company_reports_company_id_idx ON public.company_reports(company_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_company_reports_updated_at ON public.company_reports;
CREATE TRIGGER update_company_reports_updated_at
  BEFORE UPDATE ON public.company_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.company_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_company_reports" ON public.company_reports FOR SELECT TO anon        USING (true);
CREATE POLICY "anon_insert_company_reports" ON public.company_reports FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "anon_delete_company_reports" ON public.company_reports FOR DELETE TO anon        USING (true);
CREATE POLICY "auth_select_company_reports" ON public.company_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_company_reports" ON public.company_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_company_reports" ON public.company_reports FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_company_reports" ON public.company_reports FOR DELETE TO authenticated USING (true);

-- ── Storage bucket ─────────────────────────────────────────────────────────────
-- Run in Supabase SQL editor (requires storage schema):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-reports',
  'company-reports',
  false,
  52428800,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "anon_read_cr_storage"   ON storage.objects FOR SELECT TO anon          USING (bucket_id = 'company-reports');
CREATE POLICY "anon_insert_cr_storage" ON storage.objects FOR INSERT TO anon          WITH CHECK (bucket_id = 'company-reports');
CREATE POLICY "anon_delete_cr_storage" ON storage.objects FOR DELETE TO anon          USING (bucket_id = 'company-reports');
CREATE POLICY "auth_read_cr_storage"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'company-reports');
CREATE POLICY "auth_insert_cr_storage" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company-reports');
CREATE POLICY "auth_delete_cr_storage" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'company-reports');
