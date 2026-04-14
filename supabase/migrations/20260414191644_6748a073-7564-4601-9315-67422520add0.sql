CREATE TABLE public.wishlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  exchange TEXT,
  notes TEXT DEFAULT '',
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ticker)
);

ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read wishlist" ON public.wishlist FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert wishlist" ON public.wishlist FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update wishlist" ON public.wishlist FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete wishlist" ON public.wishlist FOR DELETE TO anon USING (true);
CREATE POLICY "Auth can read wishlist" ON public.wishlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert wishlist" ON public.wishlist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update wishlist" ON public.wishlist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete wishlist" ON public.wishlist FOR DELETE TO authenticated USING (true);