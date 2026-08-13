CREATE TABLE public.valuation_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  valuation_type TEXT NOT NULL CHECK (valuation_type IN ('sc', 'buffett')),
  inputs JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ticker, valuation_type)
);

ALTER TABLE public.valuation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read valuation_results" ON public.valuation_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert valuation_results" ON public.valuation_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update valuation_results" ON public.valuation_results FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete valuation_results" ON public.valuation_results FOR DELETE TO authenticated USING (true);
