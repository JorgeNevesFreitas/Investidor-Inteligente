-- ============================================================
-- Migração: alertas automáticos de mudança de estado DCF
-- Corre este script no Supabase Dashboard → SQL Editor
-- ============================================================

-- Tornar alert_type e target_price opcionais
-- (alertas automáticos não usam estes campos)
ALTER TABLE price_alerts ALTER COLUMN alert_type   DROP NOT NULL;
ALTER TABLE price_alerts ALTER COLUMN target_price DROP NOT NULL;

-- Adicionar coluna alert_category
ALTER TABLE price_alerts
  ADD COLUMN IF NOT EXISTS alert_category TEXT NOT NULL DEFAULT 'manual'
  CHECK (alert_category IN ('manual', 'auto_invest', 'auto_atento', 'auto_aguardar'));

-- Índice único: um alerta automático por ticker por categoria
CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_auto_unique
  ON price_alerts (ticker, alert_category)
  WHERE alert_category != 'manual';

-- Índice extra para filtragem rápida
CREATE INDEX IF NOT EXISTS price_alerts_category_idx ON price_alerts (alert_category);
