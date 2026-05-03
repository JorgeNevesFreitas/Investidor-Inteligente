-- ============================================================
-- Tabelas para o sistema de alertas de preço
-- Corre este script no SQL Editor do Supabase
-- ============================================================

-- Histórico de estados DCF por empresa (para detetar mudanças)
CREATE TABLE IF NOT EXISTS price_alert_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker       TEXT NOT NULL UNIQUE,
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  last_status  TEXT CHECK (last_status IN ('invest', 'watch', 'wait')),
  last_price   NUMERIC(14, 4),
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE price_alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage alert history"
  ON price_alert_history FOR ALL
  USING (auth.role() = 'authenticated');

-- Alertas manuais de preço definidos pelo utilizador
CREATE TABLE IF NOT EXISTS price_alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker         TEXT NOT NULL,
  company_id     UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name   TEXT,
  alert_type     TEXT NOT NULL CHECK (alert_type IN ('above', 'below')),
  target_price   NUMERIC(14, 4) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  triggered      BOOLEAN NOT NULL DEFAULT false,
  triggered_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_alerts_ticker_idx ON price_alerts (ticker);
CREATE INDEX IF NOT EXISTS price_alerts_active_idx  ON price_alerts (is_active, triggered);

ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage price alerts"
  ON price_alerts FOR ALL
  USING (auth.role() = 'authenticated');
