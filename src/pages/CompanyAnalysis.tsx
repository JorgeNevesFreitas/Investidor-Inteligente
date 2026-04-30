import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { MOCK_COMPANIES, FinancialYear, Company } from "@/lib/mockData";
import { AppLayout } from "@/components/AppLayout";
import { FinancialTable } from "@/components/FinancialTable";
import { MetricsChart } from "@/components/MetricsChart";
import { DCFCalculator } from "@/components/DCFCalculator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, ExternalLink, RefreshCw, Link2, Loader2,
  Database, Clock, AlertCircle, CheckCircle2, Calendar,
  AlertTriangle, Pencil, X, Upload, FileText, Trash2,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchMarketPrice, MarketPriceResult } from "@/lib/marketPriceService";
import {
  getCompanyData,
  importFromSEC,
  importFromStockAnalysis,
  dbFinancialsToFinancialYears,
  dbToCompany,
  DBCompany,
  ImportResult,
} from "@/lib/financialDataService";
import {
  CompanyReport,
  fetchReports,
  uploadReport,
  deleteReport,
  getSignedUrl,
  docxToHtml,
} from "@/lib/reportService";

// ── helpers ──────────────────────────────────────────────────────────────────

// Exchange codes returned by Yahoo Finance for US markets
const US_EXCHANGE_CODES = new Set(['NMS', 'NYQ', 'NGM', 'PCX', 'BATS', 'NYS', 'ASE', 'NAS', 'OBB', 'PNK']);

function isUSCompany(dbCompany: DBCompany | null, mockCompany: Company | undefined): boolean {
  if (dbCompany) {
    if (dbCompany.region_type === 'US') return true;
    if (dbCompany.sec_enabled) return true;
    if (dbCompany.country?.toUpperCase() === 'US') return true;
    if (dbCompany.exchange && US_EXCHANGE_CODES.has(dbCompany.exchange.toUpperCase())) return true;
    return false;
  }
  return !!mockCompany; // mock data is US only
}

type ImportSource = 'sec' | 'stockanalysis';

// Determine the default import source:
// 1. Saved preference in primary_data_source takes priority
// 2. Exchange/country detection as fallback
// 3. 'sec' for unknown new companies (safest default)
function defaultImportSource(db: DBCompany | null, mock: Company | undefined): ImportSource {
  if (db?.primary_data_source === 'SEC_XBRL') return 'sec';
  if (db?.primary_data_source === 'STOCKANALYSIS') return 'stockanalysis';
  if (isUSCompany(db, mock)) return 'sec';
  return db ? 'stockanalysis' : 'sec';
}

function secEdgarUrl(ticker: string, cik: string | null): string {
  const id = cik || ticker;
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(id)}&type=10-K&dateb=&owner=include&count=10`;
}

function stockAnalysisUrl(ticker: string, dbCompany: DBCompany | null, isUS: boolean): string {
  if (dbCompany?.stockanalysis_url) return dbCompany.stockanalysis_url;
  if (isUS) return `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/`;
  return `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/`;
}

const IR_STORAGE_KEY = (ticker: string) => `ir-url-${ticker}`;

// ── component ─────────────────────────────────────────────────────────────────

export default function CompanyAnalysis() {
  const { ticker } = useParams();
  const { toast } = useToast();

  // DB state
  const [dbCompany, setDbCompany] = useState<DBCompany | null>(null);
  const [dbFinancials, setDbFinancials] = useState<FinancialYear[]>([]);
  const [loadingDB, setLoadingDB] = useState(true);
  const [lastImported, setLastImported] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string | null>(null);

  // Market price
  const [marketPrice, setMarketPrice] = useState<MarketPriceResult | null>(null);

  // Import UI
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>("");
  const [specificYear, setSpecificYear] = useState("");
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [modalAction, setModalAction] = useState<'refresh' | 'year'>('refresh');
  const [selectedSource, setSelectedSource] = useState<ImportSource>('sec');

  // Reference links
  const [irUrl, setIrUrl] = useState("");
  const [irDraft, setIrDraft] = useState("");
  const [showIrEdit, setShowIrEdit] = useState(false);

  // Year display
  const [showAllYears, setShowAllYears] = useState(false);

  // Reports
  const [reports, setReports] = useState<CompanyReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    period_year: String(new Date().getFullYear()),
    period_month: '',
    report_date: new Date().toISOString().slice(0, 10),
    file: null as File | null,
  });
  const [uploading, setUploading] = useState(false);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const mockCompany = MOCK_COMPANIES.find(c => c.ticker === ticker);

  // Load IR URL from localStorage
  useEffect(() => {
    if (!ticker) return;
    const stored = localStorage.getItem(IR_STORAGE_KEY(ticker)) || "";
    setIrUrl(stored);
    setIrDraft(stored);
  }, [ticker]);

  const saveIrUrl = () => {
    if (!ticker) return;
    localStorage.setItem(IR_STORAGE_KEY(ticker), irDraft.trim());
    setIrUrl(irDraft.trim());
    setShowIrEdit(false);
  };

  const clearIrUrl = () => {
    if (!ticker) return;
    localStorage.removeItem(IR_STORAGE_KEY(ticker));
    setIrUrl("");
    setIrDraft("");
    setShowIrEdit(false);
  };

  // Load DB data
  const loadPersistedData = useCallback(async () => {
    if (!ticker) return;
    setLoadingDB(true);
    try {
      const data = await getCompanyData(ticker);
      if (data.company) {
        setDbCompany(data.company);
        setLastImported(data.company.last_imported_at);
        setDataSource(data.company.primary_data_source);
      }
      if (data.financials?.length > 0) {
        setDbFinancials(dbFinancialsToFinancialYears(data.financials));
      }
    } catch (err) {
      console.error("Failed to load persisted data:", err);
    } finally {
      setLoadingDB(false);
    }
  }, [ticker]);

  const loadMarketPrice = useCallback(async () => {
    if (!ticker) return;
    setMarketPrice({ price: 0, currency: "USD", source: "", timestamp: "", status: "loading" });
    setMarketPrice(await fetchMarketPrice(ticker));
  }, [ticker]);

  const loadReports = useCallback(async () => {
    if (!ticker) return;
    setLoadingReports(true);
    try {
      setReports(await fetchReports(ticker));
    } catch { /* non-critical */ }
    finally { setLoadingReports(false); }
  }, [ticker]);

  useEffect(() => {
    loadPersistedData();
    loadMarketPrice();
    loadReports();
  }, [loadPersistedData, loadMarketPrice, loadReports]);

  // Derived
  const isUS = isUSCompany(dbCompany, mockCompany);
  const hasDBData = dbFinancials.length > 0;
  const allFinancials = hasDBData ? dbFinancials : (mockCompany?.financials || []);

  const displayedFinancials = useMemo(() => {
    const fin = hasDBData ? dbFinancials : (mockCompany?.financials || []);
    return showAllYears ? fin : fin.slice(-10);
  }, [hasDBData, dbFinancials, mockCompany, showAllYears]);

  const company: Company | null = useMemo(() => {
    const base = dbCompany && hasDBData
      ? dbToCompany(dbCompany, displayedFinancials)
      : mockCompany ? { ...mockCompany, financials: displayedFinancials } : null;
    if (!base) return null;
    if (marketPrice?.status === "success" && marketPrice.price > 0) base.currentPrice = marketPrice.price;
    return base;
  }, [dbCompany, hasDBData, mockCompany, displayedFinancials, marketPrice]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openImportModal = (action: 'refresh' | 'year') => {
    setModalAction(action);
    setSelectedSource(defaultImportSource(dbCompany, mockCompany));
    setShowImportModal(true);
  };

  const handleRefresh = () => openImportModal('refresh');
  const handleImportYear = () => openImportModal('year');

  const handleConfirmImport = async () => {
    if (!ticker) return;

    if (modalAction === 'year') {
      const year = parseInt(specificYear);
      if (isNaN(year) || year < 1990 || year > new Date().getFullYear() + 1) {
        toast({ title: "Ano inválido", description: "Introduz um ano válido (ex: 2024)", variant: "destructive" });
        return;
      }
    }

    setShowImportModal(false);
    setIsImporting(true);
    setLastImportResult(null);

    try {
      const src = selectedSource;
      let result: ImportResult;

      if (modalAction === 'refresh') {
        setImportStatus(src === 'sec' ? 'A atualizar via SEC EDGAR...' : 'A atualizar via StockAnalysis...');
        result = src === 'sec'
          ? await importFromSEC(ticker, { is_incremental: true })
          : await importFromStockAnalysis({ ticker, url: dbCompany?.stockanalysis_url || undefined, is_incremental: true });
        setLastImportResult(result);
        if (result.success) {
          const n = result.years_imported?.length || 0;
          const u = result.years_updated?.length || 0;
          const s = result.years_skipped?.length || 0;
          toast({ title: "Atualização concluída", description: `${n} novos · ${u} atualizados · ${s} sem alterações` });
        } else {
          toast({ title: "Erro na importação", description: result.error || "Falha", variant: "destructive" });
        }
        await loadPersistedData();
        await loadMarketPrice();
      } else {
        const year = parseInt(specificYear);
        setImportStatus(`A importar ${year} via ${src === 'sec' ? 'SEC EDGAR' : 'StockAnalysis'}...`);
        result = src === 'sec'
          ? await importFromSEC(ticker, { specific_year: year, is_incremental: true })
          : await importFromStockAnalysis({ ticker, url: dbCompany?.stockanalysis_url || undefined, specific_year: year, is_incremental: true });
        setLastImportResult(result);
        if (result.success) {
          toast({ title: `Ano ${year} importado`, description: result.logs?.join("; ") || "Sucesso" });
          setSpecificYear("");
        } else {
          toast({ title: "Erro", description: result.error || "Falha na importação", variant: "destructive" });
        }
        await loadPersistedData();
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Falha na importação", variant: "destructive" });
    } finally {
      setIsImporting(false);
      setImportStatus("");
    }
  };

  const handleUpload = async () => {
    if (!ticker || !uploadForm.file || !uploadForm.title.trim() || !uploadForm.period_year) return;
    setUploading(true);
    try {
      let content_html: string | null = null;
      const ext = uploadForm.file.name.split('.').pop()?.toLowerCase();
      if (ext === 'docx') content_html = await docxToHtml(uploadForm.file);
      await uploadReport({
        ticker,
        company_id: dbCompany?.id ?? null,
        title: uploadForm.title.trim(),
        period_year: parseInt(uploadForm.period_year),
        period_month: uploadForm.period_month ? parseInt(uploadForm.period_month) : null,
        report_date: uploadForm.report_date || null,
        file: uploadForm.file,
        content_html,
      });
      toast({ title: "Relatório adicionado", description: uploadForm.title.trim() });
      setShowUploadModal(false);
      setUploadForm({ title: '', period_year: String(new Date().getFullYear()), period_month: '', report_date: new Date().toISOString().slice(0, 10), file: null });
      await loadReports();
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteReport = async (id: string, filePath: string | null) => {
    try {
      await deleteReport(id, filePath);
      toast({ title: "Relatório eliminado" });
      setReports(prev => prev.filter(r => r.id !== id));
      if (expandedReportId === id) setExpandedReportId(null);
    } catch (err: any) {
      toast({ title: "Erro ao eliminar", description: err.message, variant: "destructive" });
    }
  };

  const handleDownload = async (filePath: string) => {
    try {
      window.open(await getSignedUrl(filePath), '_blank');
    } catch (err: any) {
      toast({ title: "Erro ao descarregar", description: err.message, variant: "destructive" });
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!company && !loadingDB) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-semibold text-foreground">Empresa não encontrada</p>
          <p className="mt-1 text-sm text-muted-foreground">O ticker "{ticker}" não está disponível.</p>
          <div className="mt-4 flex gap-2">
            <Link to="/" className="text-sm text-primary hover:underline">Voltar ao Dashboard</Link>
            <Button size="sm" onClick={handleRefresh} disabled={isImporting}>
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Importar dados
            </Button>
          </div>
        </div>

        <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Atualizar dados</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div>
                <label className="text-xs text-muted-foreground block mb-2">Fonte de dados</label>
                <div className="space-y-2">
                  {([
                    { value: 'sec' as ImportSource, label: 'SEC (XBRL)', desc: 'Dados oficiais da SEC — empresas americanas cotadas em bolsa US' },
                    { value: 'stockanalysis' as ImportSource, label: 'StockAnalysis', desc: 'Via Firecrawl — bolsas internacionais e empresas não-americanas' },
                  ] as const).map(opt => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        selectedSource === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent/30'
                      }`}>
                      <input
                        type="radio"
                        name="import-source"
                        value={opt.value}
                        checked={selectedSource === opt.value}
                        onChange={() => setSelectedSource(opt.value)}
                        className="mt-0.5 accent-primary"
                      />
                      <div>
                        <div className="text-xs font-medium text-foreground">{opt.label}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="text-xs h-8"
                onClick={() => setShowImportModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="text-xs h-8" onClick={handleConfirmImport}>
                Atualizar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppLayout>
    );
  }

  if (loadingDB && !mockCompany) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">A carregar dados...</span>
        </div>
      </AppLayout>
    );
  }

  // ── Derived display values ────────────────────────────────────────────────

  const companyName     = company?.name     || dbCompany?.name   || ticker || "";
  const companyTicker   = company?.ticker   || ticker            || "";
  const companyExchange = company?.exchange || "";
  const companySector   = company?.sector   || "";
  const companyCurrency = company?.currency || "USD";

  const last = displayedFinancials.length > 0 ? displayedFinancials[displayedFinancials.length - 1] : null;
  const effectivePrice  = marketPrice?.status === "success" && marketPrice.price > 0 ? marketPrice.price : company?.currentPrice;
  const hasPriceValid   = effectivePrice != null && effectivePrice > 0;

  const saUrl  = stockAnalysisUrl(companyTicker, dbCompany, isUS);
  const secUrl = secEdgarUrl(companyTicker, dbCompany?.cik || null);

  const kpis = last ? [
    { label: "Preço",      value: hasPriceValid ? `$${effectivePrice!.toFixed(2)}` : (marketPrice?.status === "loading" ? "..." : "—") },
    { label: "Market Cap", value: company?.marketCap ? `$${(company.marketCap / 1000).toFixed(1)}B` : "—" },
    { label: "P/E",        value: company?.pe ? company.pe.toFixed(1) : "—" },
    { label: "EPS",        value: `$${last.eps.toFixed(2)}` },
    { label: "ROE",        value: `${last.roe.toFixed(1)}%` },
    { label: "D/E",        value: last.debtToEquity.toFixed(2) },
    { label: "Net Margin", value: `${last.netMargin.toFixed(1)}%` },
    { label: "FCF ($M)",   value: last.fcf.toLocaleString() },
  ] : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <Link to="/" className="mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>

          {/* Company identity + reference links */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{companyName}</h1>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs text-primary">{companyTicker}</span>
              {companyExchange && <span className="text-xs text-muted-foreground">{companyExchange}</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              {companySector && `${companySector} · `}{companyCurrency}
            </p>

            {/* Reference links row */}
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              {isUS && (
                <a href={secUrl} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="h-3 w-3" />SEC EDGAR
                </a>
              )}
              <a href={saUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="h-3 w-3" />StockAnalysis
              </a>
              {irUrl ? (
                <span className="inline-flex items-center gap-1">
                  <a href={irUrl} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <ExternalLink className="h-3 w-3" />Investor Relations
                  </a>
                  <button onClick={() => { setIrDraft(irUrl); setShowIrEdit(true); }}
                          className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                </span>
              ) : (
                <button onClick={() => { setIrDraft(""); setShowIrEdit(true); }}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  <Link2 className="h-3 w-3" />Adicionar IR
                </button>
              )}
            </div>
          </div>

          {/* Action buttons — icon-only on mobile, labelled on sm+ */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isImporting} className="text-xs h-9 w-9 sm:w-auto sm:px-3">
              {isImporting
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="hidden sm:inline ml-1">A importar...</span></>
                : <><RefreshCw className="h-3.5 w-3.5" /><span className="hidden sm:inline ml-1">Atualizar</span></>}
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportYear} disabled={isImporting} className="text-xs h-9 w-9 sm:w-auto sm:px-3">
              <Calendar className="h-3.5 w-3.5" /><span className="hidden sm:inline ml-1">Importar ano</span>
            </Button>
          </div>
        </div>

        {/* ── IR URL editor ── */}
        {showIrEdit && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
            <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="https://investor.empresa.com"
              value={irDraft}
              onChange={e => setIrDraft(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveIrUrl()}
              className="h-8 text-xs"
              autoFocus
            />
            <Button size="sm" onClick={saveIrUrl} disabled={!irDraft.trim()} className="text-xs shrink-0">Guardar</Button>
            {irUrl && (
              <Button size="sm" variant="ghost" onClick={clearIrUrl} className="text-xs shrink-0 text-destructive hover:text-destructive">
                <X className="h-3.5 w-3.5 mr-1" />Remover
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowIrEdit(false)} className="text-xs shrink-0">Cancelar</Button>
          </div>
        )}

        {/* ── Import status ── */}
        {importStatus && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-foreground">{importStatus}</span>
          </div>
        )}


        {/* ── Data source metadata ── */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {hasDBData && (
            <div className="flex items-center gap-1 text-positive">
              <Database className="h-3.5 w-3.5" /><span>Dados persistidos</span>
            </div>
          )}
          {!hasDBData && mockCompany && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" /><span>Dados de demonstração — clica "Atualizar" para importar dados reais</span>
            </div>
          )}
          {dataSource && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Fonte: {dataSource === "SEC_XBRL" ? "SEC / EDGAR" : "StockAnalysis"}</span>
            </div>
          )}
          {lastImported && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Última importação: {new Date(lastImported).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}
          {hasDBData && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{allFinancials.length} anos disponíveis ({allFinancials[0]?.year}–{allFinancials[allFinancials.length - 1]?.year})</span>
            </div>
          )}
        </div>

        {/* ── Last import result ── */}
        {lastImportResult?.success && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-positive" />Resultado da última atualização
            </div>
            <div className="flex flex-wrap gap-3 text-muted-foreground">
              {(lastImportResult.years_imported?.length ?? 0) > 0 && <span className="text-positive">Novos: {lastImportResult.years_imported!.join(", ")}</span>}
              {(lastImportResult.years_updated?.length ?? 0) > 0 && <span className="text-primary">Atualizados: {lastImportResult.years_updated!.join(", ")}</span>}
              {(lastImportResult.years_skipped?.length ?? 0) > 0 && <span>Sem alterações: {lastImportResult.years_skipped!.join(", ")}</span>}
            </div>
            {(lastImportResult.missing_years?.length ?? 0) > 0 && (
              <div className="flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /><span>Anos em falta: {lastImportResult.missing_years!.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        {/* ── KPI cards ── */}
        {kpis.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {kpis.map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Year range toggle ── */}
        {allFinancials.length > 10 && (
          <div className="flex items-center gap-2">
            <Button variant={showAllYears ? "outline" : "default"} size="sm" onClick={() => setShowAllYears(false)} className="text-xs">Últimos 10 anos</Button>
            <Button variant={showAllYears ? "default" : "outline"} size="sm" onClick={() => setShowAllYears(true)} className="text-xs">Todos ({allFinancials.length} anos)</Button>
          </div>
        )}

        {/* ── Empty state ── */}
        {displayedFinancials.length === 0 && !loadingDB && (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 flex flex-col items-center justify-center text-center">
            <Database className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">Sem dados financeiros</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clica em "Atualizar" para importar dados financeiros.
            </p>
          </div>
        )}

        {/* ── Tabs ── */}
        {displayedFinancials.length > 0 && company && (
          <Tabs defaultValue="financials" className="w-full">
            <TabsList className="bg-secondary border border-border overflow-x-auto flex-nowrap justify-start gap-1 p-1 h-auto">
              {["valuation", "relatorios", "financials", "ratios", "charts", "income", "balance", "cashflow"].map(tab => (
                <TabsTrigger key={tab} value={tab} className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground capitalize shrink-0 whitespace-nowrap">
                  {tab === "financials" ? "Financials"
                    : tab === "income" ? "Income Statement"
                    : tab === "balance" ? "Balance Sheet"
                    : tab === "cashflow" ? "Cash Flow"
                    : tab === "ratios" ? "Rácios"
                    : tab === "charts" ? "Gráficos"
                    : tab === "valuation" ? "Valuation"
                    : "Relatórios"}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="financials" className="mt-4 space-y-6">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5"><h3 className="text-sm font-semibold text-foreground">📈 Performance Financeira</h3></div>
                <FinancialTable data={displayedFinancials} section="performance" />
              </div>
            </TabsContent>

            <TabsContent value="income" className="mt-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5"><h3 className="text-sm font-semibold text-foreground">📄 Income Statement</h3></div>
                <FinancialTable data={displayedFinancials} section="incomeStatement" />
              </div>
            </TabsContent>

            <TabsContent value="balance" className="mt-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5"><h3 className="text-sm font-semibold text-foreground">🏦 Balance Sheet</h3></div>
                <FinancialTable data={displayedFinancials} section="balanceSheet" />
              </div>
            </TabsContent>

            <TabsContent value="cashflow" className="mt-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5"><h3 className="text-sm font-semibold text-foreground">💵 Cash Flow Statement</h3></div>
                <FinancialTable data={displayedFinancials} section="cashFlow" />
              </div>
            </TabsContent>

            <TabsContent value="ratios" className="mt-4 space-y-6">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5"><h3 className="text-sm font-semibold text-foreground">💰 Rentabilidade e Eficiência</h3></div>
                <FinancialTable data={displayedFinancials} section="profitability" />
              </div>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5"><h3 className="text-sm font-semibold text-foreground">🧾 Estrutura Financeira</h3></div>
                <FinancialTable data={displayedFinancials} section="structure" />
              </div>
            </TabsContent>

            <TabsContent value="charts" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricsChart data={displayedFinancials} dataKey="revenue"     label="Revenue ($M)"        formatValue={v => `${(v / 1000).toFixed(0)}B`} />
                <MetricsChart data={displayedFinancials} dataKey="netIncome"   label="Net Income ($M)"     color="hsl(210, 80%, 55%)" formatValue={v => `${(v / 1000).toFixed(0)}B`} />
                <MetricsChart data={displayedFinancials} dataKey="eps"         label="EPS ($)"             color="hsl(45, 93%, 47%)"  formatValue={v => `$${v.toFixed(1)}`} />
                <MetricsChart data={displayedFinancials} dataKey="fcf"         label="Free Cash Flow ($M)" formatValue={v => `${(v / 1000).toFixed(0)}B`} />
                <MetricsChart data={displayedFinancials} dataKey="grossMargin" label="Gross Margin (%)"    color="hsl(280, 60%, 55%)" formatValue={v => `${v.toFixed(0)}%`} />
                <MetricsChart data={displayedFinancials} dataKey="roe"         label="ROE (%)"             color="hsl(0, 72%, 51%)"   formatValue={v => `${v.toFixed(0)}%`} />
              </div>
            </TabsContent>

            <TabsContent value="valuation" className="mt-4">
              <DCFCalculator
                company={company}
                companyId={dbCompany?.id ?? null}
                marketPrice={marketPrice?.price || null}
                priceStatus={marketPrice?.status || "loading"}
                priceTimestamp={marketPrice?.timestamp || null}
              />
            </TabsContent>

            <TabsContent value="relatorios" className="mt-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Relatórios de Análise</h3>
                  <Button size="sm" className="text-xs h-7" onClick={() => setShowUploadModal(true)}>
                    <Upload className="h-3.5 w-3.5 mr-1" />Adicionar
                  </Button>
                </div>
                {loadingReports ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : reports.length === 0 ? (
                  <div className="py-12 flex flex-col items-center gap-2 text-center text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <p className="text-sm">Sem relatórios. Clica em "Adicionar" para fazer upload.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {reports.map(report => (
                      <div key={report.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{report.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {report.period_year}
                              {report.period_month ? ` · Mês ${report.period_month}` : ''}
                              {report.report_date ? ` · ${new Date(report.report_date).toLocaleDateString('pt-PT')}` : ''}
                              {report.file_type ? ` · ${report.file_type.toUpperCase()}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {report.content_html && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs"
                                onClick={() => setExpandedReportId(prev => prev === report.id ? null : report.id)}>
                                {expandedReportId === report.id
                                  ? <><ChevronUp className="h-3.5 w-3.5 mr-1" />Recolher</>
                                  : <><ChevronDown className="h-3.5 w-3.5 mr-1" />Expandir</>}
                              </Button>
                            )}
                            {report.file_path && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs"
                                onClick={() => handleDownload(report.file_path!)}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />Descarregar
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteReport(report.id, report.file_path)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {expandedReportId === report.id && report.content_html && (
                          <div
                            className="mt-3 rounded-md border border-border bg-background p-4 prose prose-sm max-w-none dark:prose-invert overflow-auto"
                            dangerouslySetInnerHTML={{ __html: report.content_html }}
                          />
                        )}
                        {expandedReportId === report.id && !report.content_html && report.file_path && report.file_type === 'pdf' && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Visualização de PDF não disponível — usa "Descarregar" para abrir o ficheiro.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* ── Upload report modal ─────────────────────────────────────────── */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Adicionar Relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-xs text-muted-foreground">Título *</label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder="Ex: Análise Anual 2024"
                value={uploadForm.title}
                onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Ano *</label>
                <Input
                  type="number"
                  className="mt-1 h-8 text-xs"
                  value={uploadForm.period_year}
                  onChange={e => setUploadForm(f => ({ ...f, period_year: e.target.value }))}
                  min={1990}
                  max={new Date().getFullYear() + 1}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Mês (opcional)</label>
                <select
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={uploadForm.period_month}
                  onChange={e => setUploadForm(f => ({ ...f, period_month: e.target.value }))}>
                  <option value="">—</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data do relatório (opcional)</label>
              <Input
                type="date"
                className="mt-1 h-8 text-xs"
                value={uploadForm.report_date}
                onChange={e => setUploadForm(f => ({ ...f, report_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ficheiro (.docx ou .pdf) *</label>
              <input
                type="file"
                accept=".docx,.pdf"
                className="mt-1 block w-full text-xs text-foreground file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium cursor-pointer"
                onChange={e => setUploadForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))}
              />
              {uploadForm.file && (
                <p className="mt-1 text-[11px] text-muted-foreground">{uploadForm.file.name} ({(uploadForm.file.size / 1024).toFixed(0)} KB)</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" className="text-xs h-8"
              onClick={() => setShowUploadModal(false)} disabled={uploading}>
              Cancelar
            </Button>
            <Button size="sm" className="text-xs h-8"
              onClick={handleUpload}
              disabled={uploading || !uploadForm.title.trim() || !uploadForm.period_year || !uploadForm.file}>
              {uploading
                ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />A enviar...</>
                : <><Upload className="h-3.5 w-3.5 mr-1" />Enviar</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Import source modal ─────────────────────────────────────────── */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {modalAction === 'refresh' ? 'Atualizar dados' : 'Importar ano'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Year input — only for 'year' action */}
            {modalAction === 'year' && (
              <div>
                <label className="text-xs text-muted-foreground">Ano fiscal</label>
                <Input
                  type="number"
                  placeholder="Ex: 2024"
                  className="mt-1 h-8 text-xs"
                  value={specificYear}
                  onChange={e => setSpecificYear(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmImport()}
                  min={1990}
                  max={new Date().getFullYear() + 1}
                  autoFocus
                />
              </div>
            )}

            {/* Source selector */}
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Fonte de dados</label>
              <div className="space-y-2">
                {([
                  { value: 'sec' as ImportSource, label: 'SEC (XBRL)', desc: 'Dados oficiais da SEC — empresas americanas cotadas em bolsa US' },
                  { value: 'stockanalysis' as ImportSource, label: 'StockAnalysis', desc: 'Via Firecrawl — bolsas internacionais e empresas não-americanas' },
                ] as const).map(opt => (
                  <label key={opt.value}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedSource === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/30'
                    }`}>
                    <input
                      type="radio"
                      name="import-source"
                      value={opt.value}
                      checked={selectedSource === opt.value}
                      onChange={() => setSelectedSource(opt.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="text-xs font-medium text-foreground">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" className="text-xs h-8"
              onClick={() => setShowImportModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="text-xs h-8"
              onClick={handleConfirmImport}
              disabled={modalAction === 'year' && !specificYear.trim()}>
              {modalAction === 'refresh' ? 'Atualizar' : `Importar ${specificYear || 'ano'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
