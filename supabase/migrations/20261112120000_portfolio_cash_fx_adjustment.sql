-- Allow manual FX adjustment entries in portfolio_cash (type 'fx_adjustment', signed amount),
-- used to reconcile the app's portfolio value with the broker's FX effect.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'portfolio_cash'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.portfolio_cash DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.portfolio_cash
  ADD CONSTRAINT portfolio_cash_type_check
  CHECK (type IN ('deposit', 'withdrawal', 'dividend', 'buy', 'sell', 'fx_adjustment'));
