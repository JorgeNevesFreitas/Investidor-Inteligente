import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MOCK_COMPANIES } from "@/lib/mockData";
import { DCFResult, formatCurrency, formatPercent } from "@/lib/calculations";
import { StatusBadge } from "@/components/StatusBadge";
import { AppLayout } from "@/components/AppLayout";
import { TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { listCompanies, DBCompany } from "@/lib/financialDataService";
import { deleteCompany } from "@/lib/companyDeleteService";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Dashboard() {
  const { toast } = useToast();
  const [dbCompanies, setDbCompanies] = useState<DBCompany[]>([]);

  useEffect(() => {
    listCompanies().then(setDbCompanies);
  }, []);

  const handleDelete = async (company: DBCompany) => {
    const result = await deleteCompany(company.id);
    if (result.success) {
      setDbCompanies(prev => prev.filter(c => c.id !== company.id));
      toast({ title: "Empresa eliminada", description: `${company.name} (${company.ticker}) foi removida.` });
    } else {
      toast({ title: "Erro", description: result.error || "Não foi possível eliminar", variant: "destructive" });
    }
  };

  // Merge mock + DB companies (DB takes priority)
  const dbTickers = new Set(dbCompanies.map(c => c.ticker));

  // Helper: read persisted DCF result from localStorage
  const getSavedResult = (ticker: string): DCFResult | null => {
    try {
      const saved = localStorage.getItem(`dcf-result-${ticker}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  };

  const analyses = [
    ...dbCompanies.map(c => {
      const result = getSavedResult(c.ticker);
      return { ticker: c.ticker, name: c.name, exchange: c.exchange || '', sector: c.sector || '', currency: c.currency || 'USD', pe: c.pe_ratio || 0, marketCap: c.market_cap || 0, currentPrice: c.current_price || 0, result, dbCompany: c, isDB: true };
    }),
    ...MOCK_COMPANIES.filter(c => !dbTickers.has(c.ticker)).map(c => {
      const result = getSavedResult(c.ticker);
      return { ticker: c.ticker, name: c.name, exchange: c.exchange, sector: c.sector, currency: c.currency, pe: c.pe, marketCap: c.marketCap, currentPrice: c.currentPrice, result, dbCompany: null as DBCompany | null, isDB: false };
    }),
  ];

  const safeFormatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !isFinite(value) || isNaN(value)) return "N/D";
    return formatPercent(value);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Resumo das análises fundamentalistas</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Empresas Analisadas</p>
            <p className="mt-1 text-2xl font-bold font-mono text-foreground">{analyses.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Para Investir</p>
            <p className="mt-1 text-2xl font-bold font-mono text-positive">
              {analyses.filter(a => a.result?.status === "invest").length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Aguardar</p>
            <p className="mt-1 text-2xl font-bold font-mono text-negative">
              {analyses.filter(a => a.result?.status === "wait").length}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Status", "Empresa", "Exchange", "Setor", "P/E", "Moeda", "Market Cap", "Preço", "Valor Intrínseco", "C/ Margem", "IRR", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => (
                <tr key={a.ticker} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-3 py-2.5">
                    {a.result ? <StatusBadge status={a.result.status} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link to={`/company/${a.ticker}`} className="hover:text-primary transition-colors">
                      <span className="font-semibold text-foreground">{a.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{a.ticker}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{a.exchange}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{a.sector}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{a.pe ? a.pe.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{a.currency}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{a.marketCap ? `${(a.marketCap / 1000).toFixed(0)}T` : "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{a.currentPrice > 0 ? formatCurrency(a.currentPrice) : "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{a.result ? formatCurrency(a.result.intrinsicValuePerShare) : "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{a.result ? formatCurrency(a.result.intrinsicWithMargin) : "—"}</td>
                  <td className="px-3 py-2.5">
                    {a.result ? (
                      <span className={`inline-flex items-center gap-1 font-mono text-xs ${a.result.irr >= 0 ? "text-positive" : "text-negative"}`}>
                        {a.result.irr >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {safeFormatPercent(a.result.irr)}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.dbCompany && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar empresa?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tens a certeza que queres eliminar <strong>{a.name} ({a.ticker})</strong>? Todos os dados financeiros e histórico de importação serão removidos permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(a.dbCompany!)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
