-- ============================================================
-- Agendamento da Edge Function price-alerts via pg_cron
-- Corre este script no SQL Editor do Supabase
--
-- Pré-requisitos:
--   1. A extensão pg_net deve estar ativa (já está por omissão no Supabase)
--   2. Substitui SEU_SERVICE_ROLE_KEY pela tua chave de serviço
--      (Project Settings → API → service_role key)
-- ============================================================

-- Agenda a edge function para correr de hora a hora (minuto 0 de cada hora)
SELECT cron.schedule(
  'price-alerts-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hyecidvpvfhdulpbkuxg.supabase.co/functions/v1/price-alerts',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer SEU_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Para verificar que o job ficou registado:
-- SELECT * FROM cron.job;

-- Para remover o job (se precisares):
-- SELECT cron.unschedule('price-alerts-hourly');
