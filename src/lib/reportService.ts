import { supabase } from "@/integrations/supabase/client";

export interface CompanyReport {
  id: string;
  ticker: string;
  company_id: string | null;
  period_year: number;
  period_month: number | null;
  report_date: string | null;
  title: string;
  content_html: string | null;
  file_path: string | null;
  file_type: string | null;
  created_at: string;
  updated_at: string;
}

const BUCKET = 'company-reports';

export interface ReportSummary {
  period_year: number;
  period_month: number | null;
}

export async function fetchLatestReportsByTicker(): Promise<Map<string, ReportSummary>> {
  const { data, error } = await supabase
    .from('company_reports')
    .select('ticker, period_year, period_month')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false, nullsFirst: false });

  if (error) throw error;

  const map = new Map<string, ReportSummary>();
  for (const row of data || []) {
    if (!map.has(row.ticker)) {
      map.set(row.ticker, { period_year: row.period_year, period_month: row.period_month });
    }
  }
  return map;
}

export async function fetchReports(ticker: string): Promise<CompanyReport[]> {
  const { data, error } = await supabase
    .from('company_reports')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .order('period_year', { ascending: false });
  if (error) throw error;
  return (data || []) as CompanyReport[];
}

export async function uploadReport(params: {
  ticker: string;
  company_id: string | null;
  title: string;
  period_year: number;
  period_month: number | null;
  report_date: string | null;
  file: File;
  content_html: string | null;
}): Promise<void> {
  const ext = params.file.name.split('.').pop()?.toLowerCase() || '';
  const safeName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${params.ticker.toUpperCase()}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, params.file, { contentType: params.file.type });
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from('company_reports').insert({
    ticker: params.ticker.toUpperCase(),
    company_id: params.company_id,
    title: params.title,
    period_year: params.period_year,
    period_month: params.period_month,
    report_date: params.report_date || null,
    content_html: params.content_html,
    file_path: filePath,
    file_type: ext,
  });

  if (dbError) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    throw dbError;
  }
}

export async function deleteReport(id: string, filePath: string | null): Promise<void> {
  const { error } = await supabase.from('company_reports').delete().eq('id', id);
  if (error) throw error;
  if (filePath) {
    await supabase.storage.from(BUCKET).remove([filePath]);
  }
}

export async function getSignedUrl(filePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function docxToHtml(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}
