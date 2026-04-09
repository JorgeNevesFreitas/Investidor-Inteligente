import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { MOCK_COMPANIES } from "@/lib/mockData";
import { AppLayout } from "@/components/AppLayout";
import { FinancialTable } from "@/components/FinancialTable";
import { MetricsChart } from "@/components/MetricsChart";
import { DCFCalculator } from "@/components/DCFCalculator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, RefreshCw, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CompanyAnalysis() {
  const { ticker } = useParams();
  const company = MOCK_COMPANIES.find(c => c.ticker === ticker);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [tenKLink, setTenKLink] = useState("");
  const { toast } = useToast();

  if (!company) {
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

  const last = company.financials[company.financials.length - 1];

  const kpis = [
    { label: "Preço", value: `$${company.currentPrice}` },
    { label: "Market Cap", value: `$${(company.marketCap / 1000).toFixed(1)}T` },
    { label: "P/E", value: company.pe.toFixed(1) },
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
              <h1 className="text-xl font-bold text-foreground">{company.name}</h1>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs text-primary">{company.ticker}</span>
              <span className="text-xs text-muted-foreground">{company.exchange}</span>
            </div>
            <p className="text-sm text-muted-foreground">{company.sector} · {company.currency}</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpis.map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

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
              <FinancialTable data={company.financials} section="performance" />
            </div>
          </TabsContent>

          <TabsContent value="ratios" className="mt-4 space-y-6">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-4 py-2.5">
                <h3 className="text-sm font-semibold text-foreground">💰 Rentabilidade e Eficiência</h3>
              </div>
              <FinancialTable data={company.financials} section="profitability" />
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-4 py-2.5">
                <h3 className="text-sm font-semibold text-foreground">🧾 Estrutura Financeira</h3>
              </div>
              <FinancialTable data={company.financials} section="structure" />
            </div>
          </TabsContent>

          <TabsContent value="charts" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetricsChart data={company.financials} dataKey="revenue" label="Revenue ($M)" formatValue={v => `${(v / 1000).toFixed(0)}B`} />
              <MetricsChart data={company.financials} dataKey="netIncome" label="Net Income ($M)" color="hsl(210, 80%, 55%)" formatValue={v => `${(v / 1000).toFixed(0)}B`} />
              <MetricsChart data={company.financials} dataKey="eps" label="EPS ($)" color="hsl(45, 93%, 47%)" formatValue={v => `$${v.toFixed(1)}`} />
              <MetricsChart data={company.financials} dataKey="fcf" label="Free Cash Flow ($M)" formatValue={v => `${(v / 1000).toFixed(0)}B`} />
              <MetricsChart data={company.financials} dataKey="grossMargin" label="Gross Margin (%)" color="hsl(280, 60%, 55%)" formatValue={v => `${v.toFixed(0)}%`} />
              <MetricsChart data={company.financials} dataKey="roe" label="ROE (%)" color="hsl(0, 72%, 51%)" formatValue={v => `${v.toFixed(0)}%`} />
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
