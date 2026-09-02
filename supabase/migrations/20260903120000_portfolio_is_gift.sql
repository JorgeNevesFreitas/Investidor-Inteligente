-- Marks a buy transaction as a gifted/free share (price locked to 0 in the UI when set).
ALTER TABLE public.portfolio_transactions
  ADD COLUMN IF NOT EXISTS is_gift BOOLEAN NOT NULL DEFAULT false;
