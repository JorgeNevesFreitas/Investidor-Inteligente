import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MOCK_COMPANIES } from "@/lib/mockData";
import { DCFResult, formatCurrency, formatPercent } from "@/lib/calculations";
import { StatusBadge } from "@/components/StatusBadge";
import { AppLayout } from "@/components/AppLayout";
import { TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { listCompanies, DBCompany } from "@/lib/financialDataService";
import { fetchLatestReportsByTicker, ReportSummary } from "@/lib/reportService";
import { deleteCompany } from "@/lib/companyDeleteService";
import { getAllDCFValuations } from "@/lib/dcfService";
import { fetchQuoteData, fetchMarketPrice, QuoteData } from "@/lib/marketPriceService";
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

const PRICE_POLL_MS = 30_000;

export default function Dashboard() {
  const { toast } = useToast();
  const [dbCompanies, setDbCompanies] = useState<DBCompany[]>([]);
  const [dcfMap, setDcfMap] = useState<Map<string, DCFResult>>(new Map());
  const [quoteMap, setQuoteMap] = useState<Map<string, QuoteData>>(new Map());
  const [livePrice, setLivePrice] = useState<Map<string, number>>(new Map());
  const [reportMap, setReportMap] = useState<Map<string, ReportSummary>>(new Map());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial load: companies + DCF results + latest reports
  useEffect(() => {
    listCompanies().then(setDbCompanies);
    getAllDCFValuations().then(valuations => {
      const map = new Map<string, DCFResult>();
      for (const v of valuations) map.set(v.ticker, v.result);
      setDcfMap(map);
    });
    fetchLatestReportsByTicker().then(setReportMap).catch(() => {});
  }, []);

  // Once companies list is ready, fetch full quotes for all tickers
  useEffect(() => {
    const tickers = allTickers();
    if (tickers.length === 0) return;

    Promise.all(tickers.map(t => fetchQuoteData(t).then(q => [t, q] as const))).then(pairs => {
      setQuoteMap(new Map(pairs));
      // Seed live prices from quotes so table isn't empty while polling starts
      setLivePrice(prev => {
        const next = new Map(prev);
        for (const [t, q] of pairs) if (q.price > 0) next.set(t, q.price);
        return next;
      });
    });

    // Start 30s price polling
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      const ts = allTickers();
      Promise.all(ts.map(t => fetchMarketPrice(t).then(r => [t, r.price] as const))).then(pairs => {
        setLivePrice(prev => {
          const next = new Map(prev);
          for (const [t, p] of pairs) if (p > 0) next.set(t, p);
          return next;
        });
      });
    }, PRICE_POLL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [dbCompanies]); // re-run when companies change

  const dbTickers = new Set(dbCompanies.map(c => c.ticker));

  function allTickers(): string[] {
    const db = dbCompanies.map(c => c.ticker);
    const mock = MOCK_COMPANIES.filter(c => !dbTickers.has(c.ticker)).map(c => c.ticker);
    return [...db, ...mock];
  }

  const getResult = (ticker: string): DCFResult | null => {
    if (dcfMap.has(ticker)) return dcfMap.get(ticker)!;
    try {
      const saved = localStorage.getItem(`dcf-result-${ticker}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  };

  const handleDelete = async (company: DBCompany) => {
    const result = await deleteCompany(company.id);
    if (result.success) {
      setDbCompanies(prev => prev.filter(c => c.id !== company.id));
      toast({ title: "Empresa eliminada", description: `${company.name} (${company.ticker}) foi removida.` });
    } else {
      toast({ title: "Erro", description: result.error || "Não foi possível eliminar", variant: "destructive" });
    }
  };

  const analyses = [
    ...dbCompanies.map(c => {
      const q = quoteMap.get(c.ticker);
      const price = livePrice.get(c.ticker) ?? q?.price ?? c.current_price ?? 0;
      return {
        ticker: c.ticker,
        name: c.name,
        exchange: q?.exchange ?? c.exchange ?? '',
        sector: q?.sector ?? c.sector ?? '',
        currency: q?.currency ?? c.currency ?? 'USD',
        pe: q?.pe ?? c.pe_ratio ?? null,
        marketCap: q?.marketCap ?? c.market_cap ?? null,
        currentPrice: price,
        result: getResult(c.ticker),
        dbCompany: c,
        isDB: true,
        quoteLoading: !q,
      };
    }),
    ...MOCK_COMPANIES.filter(c => !dbTickers.has(c.ticker)).map(c => {
      const q = quoteMap.get(c.ticker);
      const price = livePrice.get(c.ticker) ?? q?.price ?? c.currentPrice;
      return {
        ticker: c.ticker,
        name: c.name,
        exchange: q?.exchange ?? c.exchange,
        sector: q?.sector ?? c.sector,
        currency: q?.currency ?? c.currency,
        pe: q?.pe ?? c.pe,
        marketCap: q?.marketCap ?? c.marketCap,
        currentPrice: price,
        result: getResult(c.ticker),
        dbCompany: null as DBCompany | null,
        isDB: false,
        quoteLoading: !q,
      };
    }),
  ];

  const safeFormatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !isFinite(value) || isNaN(value)) return "N/D";
    return formatPercent(value);
  };

  const fmtMarketCap = (mc: number | null) => {
    if (!mc || mc <= 0) return "—";
    if (mc >= 1_000_000) return `${(mc / 1_000_000).toFixed(2)}T`;
    if (mc >= 1_000) return `${(mc / 1_000).toFixed(1)}B`;
    return `${mc.toFixed(0)}M`;
  };

  const Dash = () => <span className="text-muted-foreground">—</span>;
  const Loading = () => <span className="text-muted-foreground animate-pulse">···</span>;

  const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const fmtReportPeriod = (r: ReportSummary) =>
    r.period_month ? `${MONTH_ABBR[r.period_month - 1]} ${r.period_year}` : `FY${r.period_year}`;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Resumo das análises fundamentalistas</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Empresas Analisadas</p>
            <p className="mt-1 text-2xl font-bold font-mono text-foreground">{analyses.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Para Investir</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Preço abaixo do valor c/ margem</p>
            <p className="mt-1 text-2xl font-bold font-mono text-positive">
              {analyses.filter(a => a.result?.status === "invest").length}
            </p>
          </div>
          <div className="rounded-lg border border-warning/25 bg-card p-4">
            <p className="text-xs text-muted-foreground">Atento</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Preço entre margem e valor intrínseco</p>
            <p className="mt-1 text-2xl font-bold font-mono text-neutral-warn">
              {analyses.filter(a => a.result?.status === "watch").length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Aguardar</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Preço acima do valor intrínseco</p>
            <p className="mt-1 text-2xl font-bold font-mono text-negative">
              {analyses.filter(a => a.result?.status === "wait").length}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[
                  { h: "Status",           mobile: true },
                  { h: "Empresa",          mobile: true },
                  { h: "Exchange",         mobile: false },
                  { h: "Setor",            mobile: false },
                  { h: "Ano Fiscal",       mobile: false },
                  { h: "P/E",              mobile: false },
                  { h: "Moeda",            mobile: false },
                  { h: "Market Cap",       mobile: false },
                  { h: "Preço",            mobile: true },
                  { h: "Valor Intrínseco", mobile: false },
                  { h: "C/ Margem",        mobile: false },
                  { h: "IRR",              mobile: true },
                  { h: "",                 mobile: true },
                ].map(({ h, mobile }) => (
                  <th key={h} className={`px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap${mobile ? "" : " hidden sm:table-cell"}`}>{h}</th>
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
                      {reportMap.has(a.ticker) && (
                        <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">
                          {fmtReportPeriod(reportMap.get(a.ticker)!)}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-xs text-muted-foreground">
                    {a.quoteLoading ? <Loading /> : (a.exchange || <Dash />)}
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-xs text-muted-foreground">
                    {a.quoteLoading ? <Loading /> : (a.sector || <Dash />)}
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-xs text-muted-foreground">
                    {a.dbCompany?.fiscal_year_end_month
                      ? MONTH_ABBR[a.dbCompany.fiscal_year_end_month - 1]
                      : <Dash />}
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 font-mono text-xs">
                    {a.quoteLoading ? <Loading /> : (a.pe ? a.pe.toFixed(1) : <Dash />)}
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-xs text-muted-foreground">{a.currency}</td>
                  <td className="hidden sm:table-cell px-3 py-2.5 font-mono text-xs">
                    {a.quoteLoading ? <Loading /> : fmtMarketCap(a.marketCap)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {a.currentPrice > 0 ? formatCurrency(a.currentPrice, a.currency) : (a.quoteLoading ? <Loading /> : <Dash />)}
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 font-mono text-xs">{a.result ? formatCurrency(a.result.intrinsicValuePerShare) : <Dash />}</td>
                  <td className="hidden sm:table-cell px-3 py-2.5 font-mono text-xs">{a.result ? formatCurrency(a.result.intrinsicWithMargin) : <Dash />}</td>
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
