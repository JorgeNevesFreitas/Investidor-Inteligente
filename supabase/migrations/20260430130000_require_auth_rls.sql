-- ============================================================
-- Remove acesso anónimo de todas as tabelas.
-- Apenas utilizadores autenticados podem aceder aos dados.
-- ============================================================

-- companies
DROP POLICY IF EXISTS "Anon can read companies"   ON public.companies;
DROP POLICY IF EXISTS "Anon can insert companies" ON public.companies;
DROP POLICY IF EXISTS "Anon can update companies" ON public.companies;
DROP POLICY IF EXISTS "Anon can delete companies" ON public.companies;

-- financial_statement_years
DROP POLICY IF EXISTS "Anon can read financial years"   ON public.financial_statement_years;
DROP POLICY IF EXISTS "Anon can insert financial years" ON public.financial_statement_years;
DROP POLICY IF EXISTS "Anon can update financial years" ON public.financial_statement_years;
DROP POLICY IF EXISTS "Anon can delete financial years" ON public.financial_statement_years;

-- financial_line_items
DROP POLICY IF EXISTS "Anon can read line items"   ON public.financial_line_items;
DROP POLICY IF EXISTS "Anon can insert line items" ON public.financial_line_items;
DROP POLICY IF EXISTS "Anon can update line items" ON public.financial_line_items;
DROP POLICY IF EXISTS "Anon can delete line items" ON public.financial_line_items;

-- import_jobs
DROP POLICY IF EXISTS "Anon can read import jobs"   ON public.import_jobs;
DROP POLICY IF EXISTS "Anon can insert import jobs" ON public.import_jobs;
DROP POLICY IF EXISTS "Anon can update import jobs" ON public.import_jobs;
DROP POLICY IF EXISTS "Anon can delete import jobs" ON public.import_jobs;

-- wishlist
DROP POLICY IF EXISTS "Anon can read wishlist"   ON public.wishlist;
DROP POLICY IF EXISTS "Anon can insert wishlist" ON public.wishlist;
DROP POLICY IF EXISTS "Anon can update wishlist" ON public.wishlist;
DROP POLICY IF EXISTS "Anon can delete wishlist" ON public.wishlist;

-- dcf_valuations
DROP POLICY IF EXISTS "Anon can read dcf_valuations"   ON public.dcf_valuations;
DROP POLICY IF EXISTS "Anon can insert dcf_valuations" ON public.dcf_valuations;
DROP POLICY IF EXISTS "Anon can update dcf_valuations" ON public.dcf_valuations;
DROP POLICY IF EXISTS "Anon can delete dcf_valuations" ON public.dcf_valuations;

-- portfolio_transactions
DROP POLICY IF EXISTS "Anon can read portfolio_transactions"   ON public.portfolio_transactions;
DROP POLICY IF EXISTS "Anon can insert portfolio_transactions" ON public.portfolio_transactions;
DROP POLICY IF EXISTS "Anon can update portfolio_transactions" ON public.portfolio_transactions;
DROP POLICY IF EXISTS "Anon can delete portfolio_transactions" ON public.portfolio_transactions;

-- portfolio_dividends
DROP POLICY IF EXISTS "Anon can read portfolio_dividends"   ON public.portfolio_dividends;
DROP POLICY IF EXISTS "Anon can insert portfolio_dividends" ON public.portfolio_dividends;
DROP POLICY IF EXISTS "Anon can update portfolio_dividends" ON public.portfolio_dividends;
DROP POLICY IF EXISTS "Anon can delete portfolio_dividends" ON public.portfolio_dividends;

-- company_reports
DROP POLICY IF EXISTS "anon_select_company_reports" ON public.company_reports;
DROP POLICY IF EXISTS "anon_insert_company_reports" ON public.company_reports;
DROP POLICY IF EXISTS "anon_delete_company_reports" ON public.company_reports;

-- storage.objects (company-reports bucket)
DROP POLICY IF EXISTS "anon_read_cr_storage"   ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_cr_storage" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_cr_storage" ON storage.objects;
