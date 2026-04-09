import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { MOCK_PORTFOLIO, PortfolioPosition } from "@/lib/mockData";
import { formatCurrency } from "@/lib/calculations";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";

export default function Portfolio() {
  const [positions] = useState<PortfolioPosition[]>(MOCK_PORTFOLIO);

  const totalInvested = positions.reduce((sum, p) => sum + p.buyPrice * p.quantity, 0);
  const totalCurrent = positions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
  const totalReturn = totalCurrent - totalInvested;
  const totalReturnPct = (totalReturn / totalInvested) * 100;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
            <p className="text-sm text-muted-foreground">Gestão de carteira de investimentos</p>
          </div>
          <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Adicionar Posição
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Valor Investido</p>
            <p className="mt-1 font-mono text-lg font-bold text-foreground">{formatCurrency(totalInvested)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Valor Atual</p>
            <p className="mt-1 font-mono text-lg font-bold text-foreground">{formatCurrency(totalCurrent)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Rentabilidade</p>
            <p className={`mt-1 font-mono text-lg font-bold ${totalReturn >= 0 ? "text-positive" : "text-negative"}`}>
              {formatCurrency(totalReturn)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Retorno %</p>
            <p className={`mt-1 font-mono text-lg font-bold flex items-center gap-1 ${totalReturnPct >= 0 ? "text-positive" : "text-negative"}`}>
              {totalReturnPct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {totalReturnPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Positions */}
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Empresa", "Ticker", "Data Compra", "Preço Compra", "Qtd.", "Preço Atual", "Valor Atual", "Rentabilidade", "%"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map(p => {
                const invested = p.buyPrice * p.quantity;
                const current = p.currentPrice * p.quantity;
                const ret = current - invested;
                const retPct = (ret / invested) * 100;
                return (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground">{p.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-primary">{p.ticker}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.buyDate}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatCurrency(p.buyPrice)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{p.quantity}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatCurrency(p.currentPrice)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatCurrency(current)}</td>
                    <td className={`px-3 py-2.5 font-mono text-xs ${ret >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatCurrency(ret)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 font-mono text-xs ${retPct >= 0 ? "text-positive" : "text-negative"}`}>
                        {retPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {retPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
