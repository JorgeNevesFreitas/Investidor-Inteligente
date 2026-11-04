-- Estado de acompanhamento da empresa no dashboard.
-- As empresas existentes e as novas importações ficam com 'following' através do DEFAULT.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS watch_status TEXT NOT NULL DEFAULT 'following'
  CONSTRAINT companies_watch_status_check CHECK (watch_status IN ('following', 'discarded'));
