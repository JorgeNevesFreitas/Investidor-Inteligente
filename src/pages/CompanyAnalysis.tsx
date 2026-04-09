import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { MOCK_COMPANIES, FinancialYear, Company } from "@/lib/mockData";
import { AppLayout } from "@/components/AppLayout";
import { FinancialTable } from "@/components/FinancialTable";
import { MetricsChart } from "@/components/MetricsChart";
import { DCFCalculator } from "@/components/DCFCalculator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, RefreshCw, Link2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function CompanyAnalysis() {
  const { ticker } = useParams();
  const baseCompany = MOCK_COMPANIES.find(c => c.ticker === ticker);
  const [extraFinancials, setExtraFinancials] = useState<FinancialYear[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [tenKLink, setTenKLink] = useState("");
  const [showAllYears, setShowAllYears] = useState(false);
  const { toast } = useToast();

  // Merge base + extra financials, deduplicate by year
  const allFinancials = useMemo(() => {
    if (!baseCompany) return [];
    const map = new Map<number, FinancialYear>();
    baseCompany.financials.forEach(f => map.set(f.year, f));
    extraFinancials.forEach(f => map.set(f.year, f));
    return Array.from(map.values()).sort((a, b) => a.year - b.year);
  }, [baseCompany?.financials, extraFinancials]);

  // Calculate growth rates for newly added years
  const financialsWithGrowth = useMemo(() => {
    return allFinancials.map((f, i) => {
      if (i === 0) return f;
      const prev = allFinancials[i - 1];
      return {
        ...f,
        revenueGrowth: f.revenueGrowth ?? ((f.revenue - prev.revenue) / prev.revenue * 100),
        netIncomeGrowth: f.netIncomeGrowth ?? ((f.netIncome - prev.netIncome) / prev.netIncome * 100),
        epsGrowth: f.epsGrowth ?? ((f.eps - prev.eps) / prev.eps * 100),
        fcfGrowth: f.fcfGrowth ?? ((f.fcf - prev.fcf) / prev.fcf * 100),
        ebitGrowth: f.ebitGrowth ?? ((f.operatingIncome - prev.operatingIncome) / prev.operatingIncome * 100),
        bookValueGrowth: f.bookValueGrowth ?? ((f.bookValuePerShare - prev.bookValuePerShare) / prev.bookValuePerShare * 100),
      };
    });
  }, [allFinancials]);

  // Filter: last 10 years or all
  const displayedFinancials = useMemo(() => {
    if (showAllYears) return financialsWithGrowth;
    return financialsWithGrowth.slice(-10);
  }, [financialsWithGrowth, showAllYears]);

  if (!baseCompany) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-semibold text-foreground">Empresa não encontrada</p>
          <p className="mt-1 text-sm text-muted-foreground">O ticker "{ticker}" não está disponível na base de dados.</p>
          <Link to="/" className="mt-4 text-sm text-primary hover:underline">Voltar ao Dashboard</Link>
        </div>
      </AppLayout>
    );
  }

  // Create a company object with merged data
  const company: Company = {
    ...baseCompany,
    financials: displayedFinancials,
  };

  const last = financialsWithGrowth[financialsWithGrowth.length - 1];

  const handleParse10K = async () => {
    if (!tenKLink.trim()) return;
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-10k', {
        body: { url: tenKLink.trim() },
      });

      if (error) throw new Error(error.message);

      if (!data?.success) {
        toast({
          title: "Erro na extração",
          description: data?.error || "Não foi possível extrair dados do 10-K.",
          variant: "destructive",
        });
        return;
      }

      const newYear: FinancialYear = data.data;
      setExtraFinancials(prev => {
        const filtered = prev.filter(f => f.year !== newYear.year);
        return [...filtered, newYear];
      });

      toast({
        title: `Dados de ${newYear.year} importados`,
        description: `Revenue: $${(newYear.revenue / 1000).toFixed(0)}B · EPS: $${newYear.eps?.toFixed(2)} · FCF: $${(newYear.fcf / 1000).toFixed(0)}B`,
      });
    } catch (err: any) {
      console.error('Error parsing 10-K:', err);
      toast({
        title: "Erro",
        description: err.message || "Falha ao processar o 10-K. Tente outro link.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const kpis = [
    { label: "Preço", value: `$${baseCompany.currentPrice}` },
    { label: "Market Cap", value: `$${(baseCompany.marketCap / 1000).toFixed(1)}T` },
    { label: "P/E", value: baseCompany.pe.toFixed(1) },
    { label: "EPS", value: `$${last.eps.toFixed(2)}` },
    { label: "ROE", value: `${last.roe.toFixed(1)}%` },
    { label: "D/E", value: last.debtToEquity.toFixed(2) },
    { label: "Net Margin", value: `${last.netMargin.toFixed(1)}%` },
    { label: "FCF ($M)", value: last.fcf.toLocaleString() },
  ];

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
              <h1 className="text-xl font-bold text-foreground">{baseCompany.name}</h1>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs text-primary">{baseCompany.ticker}</span>
              <span className="text-xs text-muted-foreground">{baseCompany.exchange}</span>
            </div>
            <p className="text-sm text-muted-foreground">{baseCompany.sector} · {baseCompany.currency}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLinkInput(!showLinkInput)}
              className="text-xs"
            >
              <Link2 className="h-3.5 w-3.5 mr-1" />
              10-K Link
            </Button>
          </div>
        </div>

        {/* Manual 10-K link */}
        {showLinkInput && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
            <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Cole aqui o link do 10-K (ex: https://stockanalysis.com/stocks/aapl/financials/)"
              value={tenKLink}
              onChange={(e) => setTenKLink(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              disabled={!tenKLink.trim() || isUpdating}
              onClick={handleParse10K}
              className="text-xs shrink-0"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  A extrair...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Importar dados
                </>
              )}
            </Button>
            {tenKLink && (
              <a href={tenKLink} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <ExternalLink className="h-4 w-4 text-primary hover:text-primary/80" />
              </a>
            )}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpis.map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {/* Year range toggle */}
        {financialsWithGrowth.length > 10 && (
          <div className="flex items-center gap-2">
            <Button
              variant={showAllYears ? "outline" : "default"}
              size="sm"
              onClick={() => setShowAllYears(false)}
              className="text-xs"
            >
              Últimos 10 anos
            </Button>
            <Button
              variant={showAllYears ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAllYears(true)}
              className="text-xs"
            >
              Todos os dados ({financialsWithGrowth.length} anos)
            </Button>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="financials" className="w-full">
          <TabsList className="bg-secondary border border-border">
            <TabsTrigger value="financials" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Financials</TabsTrigger>
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
      </div>
    </AppLayout>
  );
}
