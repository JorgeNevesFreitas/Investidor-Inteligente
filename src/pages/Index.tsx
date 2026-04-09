import { Link } from "react-router-dom";
import { MOCK_COMPANIES } from "@/lib/mockData";
import { calculateDCF, formatCurrency, formatPercent } from "@/lib/calculations";
import { StatusBadge } from "@/components/StatusBadge";
import { AppLayout } from "@/components/AppLayout";
import { TrendingUp, TrendingDown } from "lucide-react";

const defaultDCF = {
  method: "fcf" as const,
  discountRate: 10,
  growthRate1to5: 8,
  growthRate6to10: 5,
  terminalMultiple: 15,
  marginOfSafety: 25,
};

export default function Dashboard() {
  const analyses = MOCK_COMPANIES.map(c => {
    const last = c.financials[c.financials.length - 1];
    const result = calculateDCF(last.fcf, c.sharesOutstanding, c.currentPrice, defaultDCF);
    return { company: c, result, lastYear: last };
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Resumo das análises fundamentalistas</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Empresas Analisadas</p>
            <p className="mt-1 text-2xl font-bold font-mono text-foreground">{analyses.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Para Investir</p>
            <p className="mt-1 text-2xl font-bold font-mono text-positive">
              {analyses.filter(a => a.result.status === "invest").length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Aguardar</p>
            <p className="mt-1 text-2xl font-bold font-mono text-negative">
              {analyses.filter(a => a.result.status === "wait").length}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Status", "Empresa", "Exchange", "Setor", "P/E", "Moeda", "Market Cap", "Preço", "Valor Intrínseco", "C/ Margem", "IRR", "Última Análise"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analyses.map(({ company: c, result }) => (
                <tr key={c.ticker} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-3 py-2.5"><StatusBadge status={result.status} /></td>
                  <td className="px-3 py-2.5">
                    <Link to={`/company/${c.ticker}`} className="hover:text-primary transition-colors">
                      <span className="font-semibold text-foreground">{c.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{c.ticker}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{c.exchange}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{c.sector}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{c.pe.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{c.currency}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{(c.marketCap / 1000).toFixed(0)}T</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{formatCurrency(c.currentPrice)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{formatCurrency(result.intrinsicValuePerShare)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{formatCurrency(result.intrinsicWithMargin)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 font-mono text-xs ${result.irr >= 0 ? "text-positive" : "text-negative"}`}>
                      {result.irr >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {formatPercent(result.irr)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">2025-04-09</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
