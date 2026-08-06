-- Adiciona campo de notas livres por empresa
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ;
