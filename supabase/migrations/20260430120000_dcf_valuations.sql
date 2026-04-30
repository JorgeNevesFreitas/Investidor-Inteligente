CREATE TABLE public.dcf_valuations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('fcf', 'eps')),
  inputs JSONB NOT NULL,
  result JSONB NOT NULL,
  price_at_calculation NUMERIC,
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ticker)
);

ALTER TABLE public.dcf_valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read dcf_valuations" ON public.dcf_valuations FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert dcf_valuations" ON public.dcf_valuations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update dcf_valuations" ON public.dcf_valuations FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete dcf_valuations" ON public.dcf_valuations FOR DELETE TO anon USING (true);
CREATE POLICY "Auth can read dcf_valuations" ON public.dcf_valuations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert dcf_valuations" ON public.dcf_valuations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update dcf_valuations" ON public.dcf_valuations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete dcf_valuations" ON public.dcf_valuations FOR DELETE TO authenticated USING (true);
