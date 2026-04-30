-- Add fiscal year end month to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month INTEGER CHECK (fiscal_year_end_month BETWEEN 1 AND 12);
