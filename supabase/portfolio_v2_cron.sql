-- ============================================================
-- Agendamento da Edge Function portfolio-snapshot via pg_cron
-- Corre este script no SQL Editor do Supabase, DEPOIS de:
--   1. Correr supabase/migrations/20260902120000_portfolio_v2.sql
--   2. Fazer deploy da function: supabase functions deploy portfolio-snapshot
--
-- Pré-requisitos:
--   1. A extensão pg_net deve estar ativa (já está por omissão no Supabase)
--   2. Substitui SEU_SERVICE_ROLE_KEY pela tua chave de serviço
--      (Project Settings → API → service_role key)
-- ============================================================

-- Corre às 23:00 UTC, de segunda a sexta (após o fecho da NYSE)
SELECT cron.schedule(
  'portfolio-snapshot-daily',
  '0 23 * * 1-5',
  $$
  SELECT net.http_post(
    url     := 'https://hyecidvpvfhdulpbkuxg.supabase.co/functions/v1/portfolio-snapshot',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer SEU_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Para verificar que o job ficou registado:
-- SELECT * FROM cron.job;

-- Para remover o job (se precisares):
-- SELECT cron.unschedule('portfolio-snapshot-daily');
