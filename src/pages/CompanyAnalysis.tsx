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
import { ArrowLeft, ExternalLink, RefreshCw, Link2, Loader2, Database, Clock, AlertCircle, CheckCircle2, Calendar, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getCompanyData,
  importFromSEC,
  importFromStockAnalysis,
  dbFinancialsToFinancialYears,
  dbToCompany,
  DBCompany,
  CompanyData,
  ImportResult,
} from "@/lib/financialDataService";

export default function CompanyAnalysis() {
  const { ticker } = useParams();
  const { toast } = useToast();

  // DB state
  const [dbCompany, setDbCompany] = useState<DBCompany | null>(null);
  const [dbFinancials, setDbFinancials] = useState<FinancialYear[]>([]);
  const [loadingDB, setLoadingDB] = useState(true);
  const [lastImported, setLastImported] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string | null>(null);

  // UI state
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [saLink, setSaLink] = useState("");
  const [showAllYears, setShowAllYears] = useState(false);
  const [showYearImport, setShowYearImport] = useState(false);
  const [specificYear, setSpecificYear] = useState("");
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);

  // Fallback to mock data
  const mockCompany = MOCK_COMPANIES.find(c => c.ticker === ticker);

  // Load persisted data on mount
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
      if (data.financials && data.financials.length > 0) {
        const converted = dbFinancialsToFinancialYears(data.financials);
        setDbFinancials(converted);
      }
    } catch (err) {
      console.error("Failed to load persisted data:", err);
    } finally {
      setLoadingDB(false);
    }
  }, [ticker]);

  useEffect(() => {
    loadPersistedData();
  }, [loadPersistedData]);

  // Determine which data to display
  const hasDBData = dbFinancials.length > 0;
  const displayedFinancials = useMemo(() => {
    const financials = hasDBData ? dbFinancials : (mockCompany?.financials || []);
    if (showAllYears) return financials;
    return financials.slice(-10);
  }, [hasDBData, dbFinancials, mockCompany, showAllYears]);

  // Build company object for components
  const company: Company | null = useMemo(() => {
    if (dbCompany && hasDBData) {
      return dbToCompany(dbCompany, displayedFinancials);
    }
    if (mockCompany) {
      return { ...mockCompany, financials: displayedFinancials };
    }
    return null;
  }, [dbCompany, hasDBData, mockCompany, displayedFinancials]);

  // Handlers
  const handleRefresh = async () => {
    if (!ticker) return;
    setIsImporting(true);
    setImportStatus("A verificar fonte de dados...");
    setLastImportResult(null);

    try {
      const isUS = dbCompany?.region_type === "US" || dbCompany?.sec_enabled || (!dbCompany && mockCompany);
      let result: ImportResult;

      if (isUS) {
        setImportStatus("A atualizar dados da SEC (incremental)...");
        result = await importFromSEC(ticker, { is_incremental: true });
        if (!result.success) {
          setImportStatus("SEC falhou, a tentar StockAnalysis...");
          result = await importFromStockAnalysis({ ticker, is_incremental: true });
        }
      } else {
        setImportStatus("A atualizar dados do StockAnalysis (incremental)...");
        const url = dbCompany?.stockanalysis_url || undefined;
        result = await importFromStockAnalysis({ ticker, url, is_incremental: true });
      }

      setLastImportResult(result);

      if (result.success) {
        const newCount = result.years_imported?.length || 0;
        const updCount = result.years_updated?.length || 0;
        const skipCount = result.years_skipped?.length || 0;
        toast({
          title: "Atualização concluída",
          description: `${newCount} novos, ${updCount} atualizados, ${skipCount} sem alterações`,
        });
      } else {
        toast({ title: "Erro na importação", description: result.error || "Falha", variant: "destructive" });
      }

      await loadPersistedData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Falha na importação", variant: "destructive" });
    } finally {
      setIsImporting(false);
      setImportStatus("");
    }
  };

  const handleImportSpecificYear = async () => {
    if (!ticker || !specificYear) return;
    const year = parseInt(specificYear);
    if (isNaN(year) || year < 1990 || year > new Date().getFullYear() + 1) {
      toast({ title: "Ano inválido", description: "Introduz um ano válido (ex: 2024)", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setImportStatus(`A importar ano ${year}...`);
    setLastImportResult(null);

    try {
      const isUS = dbCompany?.region_type === "US" || dbCompany?.sec_enabled || (!dbCompany && mockCompany);
      let result: ImportResult;

      if (isUS) {
        result = await importFromSEC(ticker, { specific_year: year, is_incremental: true });
      } else {
        const url = dbCompany?.stockanalysis_url || undefined;
        result = await importFromStockAnalysis({ ticker, url, specific_year: year, is_incremental: true });
      }

      setLastImportResult(result);

      if (result.success) {
        toast({ title: `Ano ${year} importado`, description: result.logs?.join('; ') || "Sucesso" });
        setSpecificYear("");
        setShowYearImport(false);
      } else {
        toast({ title: "Erro", description: result.error || "Falha na importação", variant: "destructive" });
      }

      await loadPersistedData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
      setImportStatus("");
    }
  };

  const handleImportFromLink = async () => {
    if (!saLink.trim() || !ticker) return;
    setIsImporting(true);
    setImportStatus("A importar do StockAnalysis...");

    try {
      const result = await importFromStockAnalysis({
        ticker,
        url: saLink.trim(),
        company_name: mockCompany?.name || dbCompany?.name,
        exchange: mockCompany?.exchange || dbCompany?.exchange || undefined,
      });

      if (result.success) {
        toast({
          title: "Dados importados com sucesso",
          description: `${result.years_imported?.length || 0} anos importados do StockAnalysis`,
        });
        setSaLink("");
        setShowLinkInput(false);
        await loadPersistedData();
      } else {
        toast({
          title: "Erro na importação",
          description: result.error || "Não foi possível importar dados",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message || "Falha na importação",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      setImportStatus("");
    }
  };

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

  const companyName = company?.name || dbCompany?.name || ticker || "";
  const companyTicker = company?.ticker || ticker || "";
  const companyExchange = company?.exchange || "";
  const companySector = company?.sector || "";
  const companyCurrency = company?.currency || "USD";

  const last = displayedFinancials.length > 0 ? displayedFinancials[displayedFinancials.length - 1] : null;
  const allFinancials = hasDBData ? dbFinancials : (mockCompany?.financials || []);

  const kpis = last ? [
    { label: "Preço", value: company?.currentPrice ? `$${company.currentPrice}` : "—" },
    { label: "Market Cap", value: company?.marketCap ? `$${(company.marketCap / 1000).toFixed(1)}T` : "—" },
    { label: "P/E", value: company?.pe ? company.pe.toFixed(1) : "—" },
    { label: "EPS", value: `$${last.eps.toFixed(2)}` },
    { label: "ROE", value: `${last.roe.toFixed(1)}%` },
    { label: "D/E", value: last.debtToEquity.toFixed(2) },
    { label: "Net Margin", value: `${last.netMargin.toFixed(1)}%` },
    { label: "FCF ($M)", value: last.fcf.toLocaleString() },
  ] : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link to="/" className="mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{companyName}</h1>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs text-primary">{companyTicker}</span>
              {companyExchange && <span className="text-xs text-muted-foreground">{companyExchange}</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              {companySector && `${companySector} · `}{companyCurrency}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isImporting}
              className="text-xs"
            >
              {isImporting ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />A importar...</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowYearImport(!showYearImport)}
              className="text-xs"
            >
              <Calendar className="h-3.5 w-3.5 mr-1" />
              Importar ano
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLinkInput(!showLinkInput)}
              className="text-xs"
            >
              <Link2 className="h-3.5 w-3.5 mr-1" />
              StockAnalysis Link
            </Button>
          </div>
        </div>

        {/* Import status */}
        {importStatus && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-foreground">{importStatus}</span>
          </div>
        )}

        {/* Data source & metadata */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {hasDBData && (
            <div className="flex items-center gap-1 text-positive">
              <Database className="h-3.5 w-3.5" />
              <span>Dados persistidos</span>
            </div>
          )}
          {!hasDBData && mockCompany && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Dados de demonstração — clica "Atualizar" para importar dados reais</span>
            </div>
          )}
          {dataSource && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Fonte: {dataSource === 'SEC_XBRL' ? 'SEC / EDGAR' : 'StockAnalysis'}</span>
            </div>
          )}
          {lastImported && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Última importação: {new Date(lastImported).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          {hasDBData && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{allFinancials.length} anos disponíveis ({allFinancials[0]?.year}–{allFinancials[allFinancials.length - 1]?.year})</span>
            </div>
          )}
        </div>

        {/* StockAnalysis link input */}
        {showLinkInput && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
            <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="https://stockanalysis.com/stocks/aapl/financials/"
              value={saLink}
              onChange={(e) => setSaLink(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              disabled={!saLink.trim() || isImporting}
              onClick={handleImportFromLink}
              className="text-xs shrink-0"
            >
              {isImporting ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />A importar...</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5 mr-1" />Importar dados</>
              )}
            </Button>
            {saLink && (
              <a href={saLink} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <ExternalLink className="h-4 w-4 text-primary hover:text-primary/80" />
              </a>
            )}
          </div>
        )}

        {/* KPIs */}
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

        {/* Year range toggle */}
        {allFinancials.length > 10 && (
          <div className="flex items-center gap-2">
            <Button variant={showAllYears ? "outline" : "default"} size="sm" onClick={() => setShowAllYears(false)} className="text-xs">
              Últimos 10 anos
            </Button>
            <Button variant={showAllYears ? "default" : "outline"} size="sm" onClick={() => setShowAllYears(true)} className="text-xs">
              Todos os dados ({allFinancials.length} anos)
            </Button>
          </div>
        )}

        {/* Empty state */}
        {displayedFinancials.length === 0 && !loadingDB && (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 flex flex-col items-center justify-center text-center">
            <Database className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">Sem dados financeiros</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clica em "Atualizar" para importar dados da SEC (EUA) ou usa o botão "StockAnalysis Link" para importar manualmente.
            </p>
          </div>
        )}

        {/* Tabs */}
        {displayedFinancials.length > 0 && company && (
          <Tabs defaultValue="financials" className="w-full">
            <TabsList className="bg-secondary border border-border flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="financials" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Financials</TabsTrigger>
              <TabsTrigger value="income" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Income Statement</TabsTrigger>
              <TabsTrigger value="balance" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Balance Sheet</TabsTrigger>
              <TabsTrigger value="cashflow" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Cash Flow</TabsTrigger>
              <TabsTrigger value="ratios" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Rácios</TabsTrigger>
              <TabsTrigger value="charts" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Gráficos</TabsTrigger>
              <TabsTrigger value="valuation" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Valuation</TabsTrigger>
            </TabsList>

            <TabsContent value="financials" className="mt-4 space-y-6">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-foreground">📈 Performance Financeira</h3>
                </div>
                <FinancialTable data={displayedFinancials} section="performance" />
              </div>
            </TabsContent>

            <TabsContent value="income" className="mt-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-foreground">📄 Income Statement</h3>
                </div>
                <FinancialTable data={displayedFinancials} section="incomeStatement" />
              </div>
            </TabsContent>

            <TabsContent value="balance" className="mt-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-foreground">🏦 Balance Sheet</h3>
                </div>
                <FinancialTable data={displayedFinancials} section="balanceSheet" />
              </div>
            </TabsContent>

            <TabsContent value="cashflow" className="mt-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-foreground">💵 Cash Flow Statement</h3>
                </div>
                <FinancialTable data={displayedFinancials} section="cashFlow" />
              </div>
            </TabsContent>

            <TabsContent value="ratios" className="mt-4 space-y-6">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-foreground">💰 Rentabilidade e Eficiência</h3>
                </div>
                <FinancialTable data={displayedFinancials} section="profitability" />
              </div>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-foreground">🧾 Estrutura Financeira</h3>
                </div>
                <FinancialTable data={displayedFinancials} section="structure" />
              </div>
            </TabsContent>

            <TabsContent value="charts" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricsChart data={displayedFinancials} dataKey="revenue" label="Revenue ($M)" formatValue={v => `${(v / 1000).toFixed(0)}B`} />
                <MetricsChart data={displayedFinancials} dataKey="netIncome" label="Net Income ($M)" color="hsl(210, 80%, 55%)" formatValue={v => `${(v / 1000).toFixed(0)}B`} />
                <MetricsChart data={displayedFinancials} dataKey="eps" label="EPS ($)" color="hsl(45, 93%, 47%)" formatValue={v => `$${v.toFixed(1)}`} />
                <MetricsChart data={displayedFinancials} dataKey="fcf" label="Free Cash Flow ($M)" formatValue={v => `${(v / 1000).toFixed(0)}B`} />
                <MetricsChart data={displayedFinancials} dataKey="grossMargin" label="Gross Margin (%)" color="hsl(280, 60%, 55%)" formatValue={v => `${v.toFixed(0)}%`} />
                <MetricsChart data={displayedFinancials} dataKey="roe" label="ROE (%)" color="hsl(0, 72%, 51%)" formatValue={v => `${v.toFixed(0)}%`} />
              </div>
            </TabsContent>

            <TabsContent value="valuation" className="mt-4">
              <DCFCalculator company={company} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
