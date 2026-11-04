import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { MOCK_COMPANIES } from "@/lib/mockData";
import { DCFResult, formatCurrency, formatPercent } from "@/lib/calculations";
import { StatusBadge } from "@/components/StatusBadge";
import { AppLayout } from "@/components/AppLayout";
import { TrendingUp, TrendingDown, Trash2, StickyNote, Eye, EyeOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listCompanies, fetchLatestFiscalYears, DBCompany } from "@/lib/financialDataService";
import { fetchLatestReportsByTicker, ReportSummary } from "@/lib/reportService";
import { deleteCompany } from "@/lib/companyDeleteService";
import { getAllDCFValuations } from "@/lib/dcfService";
import { getAllBuffettValuations } from "@/lib/valuationService";
import { fetchQuoteData, fetchMarketPrice, QuoteData } from "@/lib/marketPriceService";
import { fetchTransactions } from "@/lib/portfolioService";
import { changeWatchStatus, computeOpenPositionTickers, WatchStatus, WATCH_STATUS_LABELS } from "@/lib/watchStatusService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
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
const WATCH_FILTER_KEY = 'dashboard-watch-filter';

type WatchFilter = WatchStatus | 'all';

const WATCH_FILTER_OPTIONS: { value: WatchFilter; label: string }[] = [
  { value: 'following', label: WATCH_STATUS_LABELS.following },
  { value: 'discarded', label: 'Descartadas' },
  { value: 'all', label: 'Todas' },
];

function loadWatchFilter(): WatchFilter {
  try {
    const saved = localStorage.getItem(WATCH_FILTER_KEY);
    if (saved === 'following' || saved === 'discarded' || saved === 'all') return saved;
  } catch { /* localStorage indisponível: usa o filtro por defeito */ }
  return 'following';
}

function computeLiveStatus(
  price: number,
  result: { intrinsicValuePerShare: number; intrinsicWithMargin: number },
): 'invest' | 'watch' | 'wait' {
  if (price <= result.intrinsicWithMargin) return 'invest';
  if (price <= result.intrinsicValuePerShare) return 'watch';
  return 'wait';
}

export default function Dashboard() {
  const { toast } = useToast();
  const { canEdit } = useAuth();
  const [dbCompanies, setDbCompanies] = useState<DBCompany[]>([]);
  const [dcfMap, setDcfMap] = useState<Map<string, DCFResult>>(new Map());
  const [buffettValuationsRemote, setBuffettValuationsRemote] = useState<Record<string, any>>({});
  const [quoteMap, setQuoteMap] = useState<Map<string, QuoteData>>(new Map());
  const [livePrice, setLivePrice] = useState<Map<string, number>>(new Map());
  const [reportMap, setReportMap] = useState<Map<string, ReportSummary>>(new Map());
  const [latestFiscalYearMap, setLatestFiscalYearMap] = useState<Map<string, number>>(new Map());
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [watchFilter, setWatchFilter] = useState<WatchFilter>(loadWatchFilter);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const [openPositionTickers, setOpenPositionTickers] = useState<Set<string>>(new Set());
  const [dismissedFiscalAlerts, setDismissedFiscalAlerts] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('dismissed-fiscal-alerts');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const dismissFiscalAlert = (ticker: string, fyEndYear: number) => {
    setDismissedFiscalAlerts((prev) => {
      const next = { ...prev, [ticker]: fyEndYear };
      localStorage.setItem('dismissed-fiscal-alerts', JSON.stringify(next));
      return next;
    });
  };

  // Initial load: companies + DCF results + latest reports
  useEffect(() => {
    listCompanies().then(setDbCompanies);
    getAllDCFValuations().then(valuations => {
      const map = new Map<string, DCFResult>();
      for (const v of valuations) map.set(v.ticker, v.result);
      setDcfMap(map);
    });
    fetchLatestReportsByTicker().then(setReportMap).catch(() => {});
    fetchLatestFiscalYears().then(setLatestFiscalYearMap).catch(() => {});
    getAllBuffettValuations().then(setBuffettValuationsRemote);
    fetchTransactions().then(txns => {
      setOpenPositionTickers(computeOpenPositionTickers(txns));
    }).catch(() => {});
  }, []);

  // Tickers visíveis no filtro de acompanhamento. Os cartões de estado precisam de preços de
  // todas estas empresas, por isso o filtro por estado não reduz esta lista.
  const visibleTickersKey = useMemo(() => {
    const knownTickers = new Set(dbCompanies.map(c => c.ticker));
    const db = dbCompanies
      .filter(c => watchFilter === 'all' || (c.watch_status ?? 'following') === watchFilter)
      .map(c => c.ticker);
    const mock = watchFilter === 'discarded'
      ? []
      : MOCK_COMPANIES.filter(c => !knownTickers.has(c.ticker)).map(c => c.ticker);
    return JSON.stringify([...db, ...mock]);
  }, [dbCompanies, watchFilter]);

  // Fetch full quotes for the visible tickers
  useEffect(() => {
    const tickers: string[] = JSON.parse(visibleTickersKey);
    if (tickers.length === 0) return;

    Promise.all(tickers.map(t => fetchQuoteData(t).then(q => [t, q] as const))).then(pairs => {
      setQuoteMap(prev => new Map([...prev, ...pairs]));
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
      Promise.all(tickers.map(t => fetchMarketPrice(t).then(r => [t, r.price] as const))).then(pairs => {
        setLivePrice(prev => {
          const next = new Map(prev);
          for (const [t, p] of pairs) if (p > 0) next.set(t, p);
          return next;
        });
      });
    }, PRICE_POLL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [visibleTickersKey]); // re-run when the visible companies change

  const getResult = (ticker: string): DCFResult | null => {
    try {
      const savedBuffettRemote = buffettValuationsRemote[ticker];
      if (savedBuffettRemote) return savedBuffettRemote;
    } catch {}
    try {
      const savedBuffett = localStorage.getItem(`buffett-result-${ticker}`);
      if (savedBuffett) {
        const parsed = JSON.parse(savedBuffett);
        if ((parsed.irr === undefined || parsed.irr === null) && typeof parsed.irrAtCurrentPrice === 'number') {
          parsed.irr = parsed.irrAtCurrentPrice;
        }
        return parsed;
      }
    } catch {}
    try {
      const savedSC = localStorage.getItem(`sc-result-${ticker}`);
      if (savedSC) return JSON.parse(savedSC);
    } catch {}
    if (dcfMap.has(ticker)) return dcfMap.get(ticker)!;
    try {
      const savedDCF = localStorage.getItem(`dcf-result-${ticker}`);
      if (savedDCF) return JSON.parse(savedDCF);
    } catch {}
    return null;
  };

  // Recompute status live from current price vs stored intrinsic values.
  // Usa o mesmo resultado (Buffett > SC > DCF) que alimenta a etiqueta de
  // origem na tabela, para nunca divergir do que é mostrado ao lado do nome.
  const liveStatuses = useMemo(() => {
    const map = new Map<string, 'invest' | 'watch' | 'wait'>();
    for (const [ticker, price] of livePrice.entries()) {
      const result = getResult(ticker);
      if (!result || price <= 0) continue;
      map.set(ticker, computeLiveStatus(price, result));
    }
    return map;
  }, [livePrice, dcfMap]);

  // Detect status changes and trigger price-alerts edge function for email notifications
  useEffect(() => {
    if (liveStatuses.size === 0) return;
    let changed = false;
    for (const [ticker, newStatus] of liveStatuses) {
      const prev = prevStatusesRef.current.get(ticker);
      if (prev !== undefined && prev !== newStatus) { changed = true; break; }
    }
    if (changed) supabase.functions.invoke('price-alerts').catch(() => {});
    prevStatusesRef.current = new Map(liveStatuses);
  }, [liveStatuses]);

  const dbTickers = new Set(dbCompanies.map(c => c.ticker));

  const handleWatchFilterChange = (filter: WatchFilter) => {
    setWatchFilter(filter);
    try {
      localStorage.setItem(WATCH_FILTER_KEY, filter);
    } catch { /* localStorage indisponível: o filtro vale só para esta sessão */ }
  };

  const handleWatchStatusChange = async (company: DBCompany, status: WatchStatus) => {
    if ((company.watch_status ?? 'following') === status) return;
    const result = await changeWatchStatus(company, status);
    if (result.success === false) {
      toast({ title: result.title, description: result.description, variant: "destructive" });
      return;
    }
    setDbCompanies(prev => prev.map(c => c.id === company.id ? { ...c, watch_status: status } : c));
    toast({ title: "Estado atualizado", description: `${company.ticker}: ${WATCH_STATUS_LABELS[status]}` });
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
      const result = getResult(c.ticker);
      return {
        ticker: c.ticker,
        name: c.name,
        exchange: q?.exchange ?? c.exchange ?? '',
        sector: q?.sector ?? c.sector ?? '',
        currency: q?.currency ?? c.currency ?? 'USD',
        pe: q?.pe ?? c.pe_ratio ?? null,
        marketCap: q?.marketCap ?? c.market_cap ?? null,
        currentPrice: price,
        result,
        dbCompany: c,
        isDB: true,
        quoteLoading: !q,
        notes: c.notes ?? null,
        watchStatus: (c.watch_status ?? 'following') as WatchStatus,
      };
    }),
    ...MOCK_COMPANIES.filter(c => !dbTickers.has(c.ticker)).map(c => {
      const q = quoteMap.get(c.ticker);
      const price = livePrice.get(c.ticker) ?? q?.price ?? c.currentPrice;
      const result = getResult(c.ticker);
      return {
        ticker: c.ticker,
        name: c.name,
        exchange: q?.exchange ?? c.exchange,
        sector: q?.sector ?? c.sector,
        currency: q?.currency ?? c.currency,
        pe: q?.pe ?? c.pe,
        marketCap: q?.marketCap ?? c.marketCap,
        currentPrice: price,
        result,
        dbCompany: null as DBCompany | null,
        isDB: false,
        quoteLoading: !q,
        notes: null as string | null,
        watchStatus: 'following' as WatchStatus,
      };
    }),
  ];

  analyses.sort((a, b) => {
    const irrA = a.result && isFinite(a.result.irr) ? a.result.irr : -Infinity;
    const irrB = b.result && isFinite(b.result.irr) ? b.result.irr : -Infinity;
    return irrB - irrA;
  });

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

  const toggleFilter = (f: string) => setActiveFilter(prev => prev === f ? null : f);
  const watchCounts: Record<WatchFilter, number> = {
    following: analyses.filter(a => a.watchStatus === 'following').length,
    discarded: analyses.filter(a => a.watchStatus === 'discarded').length,
    all: analyses.length,
  };
  const watchFilteredAnalyses = watchFilter === 'all'
    ? analyses
    : analyses.filter(a => a.watchStatus === watchFilter);
  const filteredAnalyses = activeFilter
    ? watchFilteredAnalyses.filter(a => (liveStatuses.get(a.ticker) ?? a.result?.status) === activeFilter)
    : watchFilteredAnalyses;

  const Dash = () => <span className="text-muted-foreground">—</span>;
  const Loading = () => <span className="text-muted-foreground animate-pulse">···</span>;

  const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const fmtReportPeriod = (r: ReportSummary) =>
    r.period_month ? `${MONTH_ABBR[r.period_month - 1]} ${r.period_year}` : `FY${r.period_year}`;

  // Alerta de dados desatualizados face ao calendário do exercício fiscal da empresa.
  const getFiscalYearAlert = (
    ticker: string,
    fiscalYearEndMonth: number,
    latestImportedYear: number | undefined,
  ): { type: 'none' | 'warning' | 'danger' | 'ambiguous'; fyEndYear: number; message: string } => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    // Fim de exercício fiscal mais recente que já deveria ter ocorrido.
    const fyEndYear = currentMonth >= fiscalYearEndMonth ? currentYear : currentYear - 1;

    if (latestImportedYear !== undefined && latestImportedYear >= fyEndYear) {
      return { type: 'none', fyEndYear, message: '' };
    }

    // Fechos em Jan/Fev são ambíguos: a convenção de rotulagem do ano fiscal (ex: exercícios
    // que terminam "no domingo mais próximo de 31 de Dezembro", como a JNJ) pode não coincidir
    // com o ano civil aqui calculado, por isso não decidimos automaticamente — pedimos confirmação.
    if (fiscalYearEndMonth === 1 || fiscalYearEndMonth === 2) {
      if (dismissedFiscalAlerts[ticker] === fyEndYear) {
        return { type: 'none', fyEndYear, message: '' };
      }
      return {
        type: 'ambiguous',
        fyEndYear,
        message: 'Esta empresa tem fecho de exercício em Janeiro/Fevereiro. O ano fiscal mais recente nos nossos dados pode já estar correto, mesmo que o mês nominal sugira o contrário (ex: exercícios que terminam "no domingo mais próximo de 31 de Dezembro", como a JNJ). Confirma manualmente e dispensa o alerta se os dados já estiverem atualizados.',
      };
    }

    const nextMonth = fiscalYearEndMonth === 12 ? 1 : fiscalYearEndMonth + 1;
    const nextMonthYear = fiscalYearEndMonth === 12 ? fyEndYear + 1 : fyEndYear;
    const monthsPassed = (currentYear - nextMonthYear) * 12 + (currentMonth - nextMonth);

    const type = monthsPassed <= 0 ? 'warning' : 'danger';
    const message = `Dados desatualizados: o exercício fiscal terminado em ${MONTH_ABBR[fiscalYearEndMonth - 1]}/${fyEndYear} ainda não foi importado. Último ano disponível: ${latestImportedYear ?? "nenhum"}.`;
    return { type, fyEndYear, message };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Resumo das análises fundamentalistas</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <button onClick={() => setActiveFilter(null)} className={`rounded-lg border p-4 text-left transition-colors ${activeFilter === null ? "border-primary/50 bg-accent/30" : "border-border bg-card"} hover:bg-accent/20`}>
            <p className="text-xs text-muted-foreground">Empresas Analisadas</p>
            <p className="mt-1 text-2xl font-bold font-mono text-foreground">{watchFilteredAnalyses.length}</p>
          </button>
          <button onClick={() => toggleFilter("invest")} className={`rounded-lg border p-4 text-left transition-colors ${activeFilter === "invest" ? "border-primary/50 bg-accent/30" : "border-border bg-card"} hover:bg-accent/20`}>
            <p className="text-xs text-muted-foreground">Para Investir</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Preço abaixo do valor c/ margem</p>
            <p className="mt-1 text-2xl font-bold font-mono text-positive">
              {watchFilteredAnalyses.filter(a => (liveStatuses.get(a.ticker) ?? a.result?.status) === "invest").length}
            </p>
          </button>
          <button onClick={() => toggleFilter("watch")} className={`rounded-lg border p-4 text-left transition-colors ${activeFilter === "watch" ? "border-primary/50 bg-accent/30" : "border-border bg-card"} hover:bg-accent/20`}>
            <p className="text-xs text-muted-foreground">Atento</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Preço entre margem e valor intrínseco</p>
            <p className="mt-1 text-2xl font-bold font-mono text-neutral-warn">
              {watchFilteredAnalyses.filter(a => (liveStatuses.get(a.ticker) ?? a.result?.status) === "watch").length}
            </p>
          </button>
          <button onClick={() => toggleFilter("wait")} className={`rounded-lg border p-4 text-left transition-colors ${activeFilter === "wait" ? "border-primary/50 bg-accent/30" : "border-border bg-card"} hover:bg-accent/20`}>
            <p className="text-xs text-muted-foreground">Aguardar</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Preço acima do valor intrínseco</p>
            <p className="mt-1 text-2xl font-bold font-mono text-negative">
              {watchFilteredAnalyses.filter(a => (liveStatuses.get(a.ticker) ?? a.result?.status) === "wait").length}
            </p>
          </button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro de acompanhamento">
          {WATCH_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={watchFilter === value}
              onClick={() => handleWatchFilterChange(value)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${watchFilter === value ? "border-primary/50 bg-accent/30 text-foreground" : "border-border bg-card text-muted-foreground"} hover:bg-accent/20`}
            >
              {label} <span className="ml-1 font-mono">{watchCounts[value]}</span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-card">
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
                  { h: "",                 mobile: true },
                ].map(({ h, mobile }, i) => (
                  <th key={i} className={`px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap bg-card${mobile ? "" : " hidden sm:table-cell"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAnalyses.map((a) => (
                <tr key={a.ticker} className={`border-b border-border/50 hover:bg-accent/30 transition-colors${watchFilter === 'all' && a.watchStatus === 'discarded' ? " opacity-60" : ""}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const status = liveStatuses.get(a.ticker) ?? a.result?.status;
                        return status
                          ? <StatusBadge status={status} />
                          : <span className="text-xs text-muted-foreground">—</span>;
                      })()}
                      {openPositionTickers.has(a.ticker.toUpperCase()) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Posição aberta" />
                      )}
                    </div>
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
                  <td className="hidden sm:table-cell px-3 py-2.5 text-xs">
                    {(() => {
                      const month = a.dbCompany?.fiscal_year_end_month;
                      if (!month) return <Dash />;
                      const alert = getFiscalYearAlert(
                        a.ticker,
                        month,
                        a.dbCompany ? latestFiscalYearMap.get(a.dbCompany.id) : undefined,
                      );
                      const colorClass = alert.type === 'warning' ? "text-neutral-warn"
                        : alert.type === 'danger' ? "text-negative"
                        : alert.type === 'ambiguous' ? "text-blue-400"
                        : "text-muted-foreground";
                      return (
                        <span className="inline-flex items-center gap-1">
                          <span className={colorClass} title={alert.type !== 'none' ? alert.message : undefined}>
                            {MONTH_ABBR[month - 1]}
                          </span>
                          {alert.type === 'ambiguous' && (
                            <button
                              type="button"
                              title="Dispensar alerta até ao próximo ano"
                              onClick={(e) => { e.stopPropagation(); dismissFiscalAlert(a.ticker, alert.fyEndYear); }}
                              className="text-muted-foreground hover:text-positive transition-colors leading-none"
                            >
                              ✓
                            </button>
                          )}
                        </span>
                      );
                    })()}
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
                  <td className="hidden sm:table-cell px-3 py-2.5 font-mono text-xs">{a.result ? formatCurrency(a.result.intrinsicValuePerShare, a.currency) : <Dash />}</td>
                  <td className="hidden sm:table-cell px-3 py-2.5 font-mono text-xs">{a.result ? formatCurrency(a.result.intrinsicWithMargin, a.currency) : <Dash />}</td>
                  <td className="px-3 py-2.5">
                    {a.result ? (
                      <span className={`inline-flex items-center gap-1 font-mono text-xs ${a.result.irr >= 0 ? "text-positive" : "text-negative"}`}>
                        {a.result.irr >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {safeFormatPercent(a.result.irr)}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.notes?.trim() && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <StickyNote className="h-3.5 w-3.5 text-neutral-warn shrink-0 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs whitespace-pre-wrap text-xs">
                          {a.notes.slice(0, 240)}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.dbCompany && canEdit && (
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title={`Estado: ${WATCH_STATUS_LABELS[a.watchStatus]}`}
                              aria-label={`Alterar estado de ${a.ticker}`}
                              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                              {a.watchStatus === 'discarded' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuRadioGroup
                              value={a.watchStatus}
                              onValueChange={(value) => handleWatchStatusChange(a.dbCompany!, value as WatchStatus)}
                            >
                              {(Object.keys(WATCH_STATUS_LABELS) as WatchStatus[]).map(status => (
                                <DropdownMenuRadioItem key={status} value={status} className="text-xs">
                                  {WATCH_STATUS_LABELS[status]}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                      </div>
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
