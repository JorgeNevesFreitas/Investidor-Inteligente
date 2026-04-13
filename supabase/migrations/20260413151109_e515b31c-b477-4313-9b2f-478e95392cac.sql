
-- Allow deleting companies, financial data, and import jobs
CREATE POLICY "Anon can delete companies" ON public.companies FOR DELETE TO anon USING (true);
CREATE POLICY "Auth can delete companies" ON public.companies FOR DELETE TO authenticated USING (true);

CREATE POLICY "Anon can delete line items" ON public.financial_line_items FOR DELETE TO anon USING (true);
CREATE POLICY "Auth can delete line items" ON public.financial_line_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Anon can delete financial years" ON public.financial_statement_years FOR DELETE TO anon USING (true);
CREATE POLICY "Auth can delete financial years" ON public.financial_statement_years FOR DELETE TO authenticated USING (true);

CREATE POLICY "Anon can delete import jobs" ON public.import_jobs FOR DELETE TO anon USING (true);
CREATE POLICY "Auth can delete import jobs" ON public.import_jobs FOR DELETE TO authenticated USING (true);
