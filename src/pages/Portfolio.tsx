import { useState, useEffect, useMemo, Fragment } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, ChevronRight, ChevronDown, Trash2, RefreshCw, Loader2, Wallet,
} from "lucide-react";
import {
  PortfolioTransaction, PortfolioDividend, Position,
  PortfolioMember, PortfolioCash, PortfolioCashMember,
  computePositions, fetchTransactions, fetchDividends,
  fetchMembers, fetchCash, fetchCashMembers,
  addTransaction, addDividend, deleteTransaction, deleteDividend,
  addCashEntryWithMembers, deleteCashEntry,
} from "@/lib/portfolioService";
import { fetchMarketPrice, MarketPriceResult } from "@/lib/marketPriceService";
import { listCompanies, DBCompany } from "@/lib/financialDataService";

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtEur = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

const fmtCcy = (v: number, ccy: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${ccy}`;
  }
};

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

const fmtQty = (v: number) =>
  v % 1 === 0 ? v.toFixed(0) : v.toFixed(4).replace(/\.?0+$/, "");

// ── Sub-components ────────────────────────────────────────────────────────────

function ReturnCell({ eur, pct }: { eur: number; pct: number }) {
  const pos = eur >= 0;
  return (
    <div className="text-right min-w-[80px]">
      <div className={`font-mono text-xs font-medium ${pos ? "text-positive" : "text-negative"}`}>
        {pos ? "+" : ""}{fmtEur(eur)}
      </div>
      <div className={`font-mono text-[10px] ${pos ? "text-positive/80" : "text-negative/80"}`}>
        {fmtPct(pct)}
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BROKERS = ["IBKR", "Degiro", "Outras"] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type AddType = "buy" | "sell" | "dividend";

interface AddForm {
  ticker: string;
  date: string;
  price: string;
  quantity: string;
  currency: string;
  notes: string;
  broker: string;
  brokerCustom: string;
}

const EMPTY_ADD_FORM: AddForm = {
  ticker: "",
  date: new Date().toISOString().split("T")[0],
  price: "",
  quantity: "",
  currency: "USD",
  notes: "",
  broker: "IBKR",
  brokerCustom: "",
};

interface CashForm {
  type: "deposit" | "withdrawal";
  date: string;
  amount: string;
  currency: "EUR" | "USD";
  broker: string;
  brokerCustom: string;
  notes: string;
  memberAmounts: Record<string, string>;
}

const EMPTY_CASH_FORM: CashForm = {
  type: "deposit",
  date: new Date().toISOString().split("T")[0],
  amount: "",
  currency: "EUR",
  broker: "IBKR",
  brokerCustom: "",
  notes: "",
  memberAmounts: {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEffectiveBroker(broker: string, custom: string): string {
  return broker === "Outras" ? (custom.trim() || "Outras") : broker;
}

function getMemberCashProportions(
  cashEntries: PortfolioCash[],
  cashMemberEntries: PortfolioCashMember[],
  members: PortfolioMember[],
  broker: string,
  currency: string,
): { memberId: string; proportion: number }[] {
  const relevantIds = new Set(
    cashEntries.filter(e => e.broker === broker && e.currency === currency).map(e => e.id)
  );
  const balances = new Map<string, number>(members.map(m => [m.id, 0]));
  for (const cm of cashMemberEntries) {
    if (relevantIds.has(cm.cash_id)) {
      balances.set(cm.member_id, (balances.get(cm.member_id) ?? 0) + cm.amount);
    }
  }
  const total = Array.from(balances.values()).filter(v => v > 0).reduce((s, v) => s + v, 0);
  if (total <= 0) return members.map(m => ({ memberId: m.id, proportion: 1 / members.length }));
  return members.map(m => ({
    memberId: m.id,
    proportion: Math.max(0, balances.get(m.id) ?? 0) / total,
  }));
}

function getMemberTickerProportions(
  cashEntries: PortfolioCash[],
  cashMemberEntries: PortfolioCashMember[],
  members: PortfolioMember[],
  ticker: string,
): { memberId: string; proportion: number }[] {
  const buyIds = new Set(
    cashEntries.filter(e => e.type === "buy" && e.ticker === ticker).map(e => e.id)
  );
  if (buyIds.size === 0) return members.map(m => ({ memberId: m.id, proportion: 1 / members.length }));
  const memberBuys = new Map<string, number>(members.map(m => [m.id, 0]));
  for (const cm of cashMemberEntries) {
    if (buyIds.has(cm.cash_id)) {
      memberBuys.set(cm.member_id, (memberBuys.get(cm.member_id) ?? 0) + Math.abs(cm.amount));
    }
  }
  const total = Array.from(memberBuys.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return members.map(m => ({ memberId: m.id, proportion: 1 / members.length }));
  return members.map(m => ({
    memberId: m.id,
    proportion: (memberBuys.get(m.id) ?? 0) / total,
  }));
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Portfolio() {
  const { toast } = useToast();

  // existing state
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [dividends, setDividends] = useState<PortfolioDividend[]>([]);
  const [companies, setCompanies] = useState<DBCompany[]>([]);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [eurUsd, setEurUsd] = useState<number>(1.09);
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<AddType>("buy");
  const [form, setForm] = useState<AddForm>(EMPTY_ADD_FORM);
  const [submitting, setSubmitting] = useState(false);

  // new state
  const [members, setMembers] = useState<PortfolioMember[]>([]);
  const [cashEntries, setCashEntries] = useState<PortfolioCash[]>([]);
  const [cashMemberEntries, setCashMemberEntries] = useState<PortfolioCashMember[]>([]);
  const [showAddCash, setShowAddCash] = useState(false);
  const [cashForm, setCashForm] = useState<CashForm>(EMPTY_CASH_FORM);
  const [submittingCash, setSubmittingCash] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadPortfolioData = async () => {
    const [txns, divs] = await Promise.all([fetchTransactions(), fetchDividends()]);
    setTransactions(txns);
    setDividends(divs);
    try {
      const [cash, cashMs] = await Promise.all([fetchCash(), fetchCashMembers()]);
      setCashEntries(cash);
      setCashMemberEntries(cashMs);
    } catch {
      // tables may not exist yet — silent fallback
    }
    return { txns, divs };
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await Promise.all([
          loadPortfolioData(),
          listCompanies().then(setCompanies).catch(() => {}),
          fetchMembers().then(setMembers).catch(() => {}),
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Price fetching ────────────────────────────────────────────────────────

  const doFetchPrices = async (txns: PortfolioTransaction[], divs: PortfolioDividend[]) => {
    const tickers = [...new Set([
      ...txns.map(t => t.ticker.toUpperCase()),
      ...divs.map(d => d.ticker.toUpperCase()),
    ])];
    if (tickers.length === 0) return;

    setPricesLoading(true);
    try {
      const eurResult: MarketPriceResult = await fetchMarketPrice("EURUSD=X");
      if (eurResult.status === "success" && eurResult.price > 0) setEurUsd(eurResult.price);

      const results = await Promise.all(
        tickers.map(ticker =>
          fetchMarketPrice(ticker).then(r => ({ ticker, price: r.price, ok: r.status === "success" }))
        )
      );
      const map = new Map<string, number>();
      for (const r of results) {
        if (r.ok && r.price > 0) map.set(r.ticker, r.price);
      }
      setPrices(map);
    } finally {
      setPricesLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) doFetchPrices(transactions, dividends);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ─────────────────────────────────────────────────────────

  const companyNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.ticker.toUpperCase(), c.name);
    return m;
  }, [companies]);

  const positions: Position[] = useMemo(
    () => computePositions(transactions, dividends, prices, companyNames, eurUsd),
    [transactions, dividends, prices, companyNames, eurUsd]
  );

  const totals = useMemo(() => {
    const basisEur = positions.reduce((s, p) => s + p.basis_eur, 0);
    const investedEur = positions.reduce((s, p) => s + p.invested_eur, 0);
    const currentEur = positions.reduce((s, p) => s + p.current_value_eur, 0);
    const stockEur = positions.reduce((s, p) => s + p.stock_return_eur, 0);
    const divEur = positions.reduce((s, p) => s + p.dividend_return_eur, 0);
    const totalEur = stockEur + divEur;
    return {
      investedEur,
      currentEur,
      stockEur,
      divEur,
      totalEur,
      stockPct: basisEur > 0 ? (stockEur / basisEur) * 100 : 0,
      divPct: basisEur > 0 ? (divEur / basisEur) * 100 : 0,
      totalPct: basisEur > 0 ? (totalEur / basisEur) * 100 : 0,
    };
  }, [positions]);

  // Saldos de liquidez por broker
  const cashByBroker = useMemo(() => {
    const map = new Map<string, { eur: number; usd: number }>();
    for (const entry of cashEntries) {
      const cur = map.get(entry.broker) ?? { eur: 0, usd: 0 };
      if (entry.currency === "EUR") cur.eur += entry.amount;
      else cur.usd += entry.amount;
      map.set(entry.broker, cur);
    }
    return Array.from(map.entries())
      .map(([broker, bal]) => ({ broker, ...bal }))
      .sort((a, b) => a.broker.localeCompare(b.broker));
  }, [cashEntries]);

  // Membros para o form — usa DB quando disponível, senão fallback fixo
  const cashFormMembers: PortfolioMember[] = useMemo(() =>
    members.length > 0 ? members : [
      { id: "_vjf", name: "V&J",     created_at: "" },
      { id: "_din", name: "Dinis",   created_at: "" },
      { id: "_mar", name: "Mariana", created_at: "" },
    ],
    [members]
  );

  // Rentabilidade por participante
  const memberStats = useMemo(() => {
    if (members.length === 0) return [];
    return members.map(member => {
      const memberCMs = cashMemberEntries.filter(cm => cm.member_id === member.id);
      const cashById = new Map(cashEntries.map(e => [e.id, e]));
      let cashEur = 0;
      let cashUsd = 0;
      for (const cm of memberCMs) {
        const entry = cashById.get(cm.cash_id);
        if (!entry) continue;
        if (entry.currency === "EUR") cashEur += cm.amount;
        else cashUsd += cm.amount;
      }
      let investedEur = 0;
      let currentValueEur = 0;
      let stockReturnEur = 0;
      let dividendReturnEur = 0;
      for (const pos of positions) {
        const props = getMemberTickerProportions(cashEntries, cashMemberEntries, members, pos.ticker);
        const prop = props.find(p => p.memberId === member.id)?.proportion ?? 0;
        investedEur += pos.invested_eur * prop;
        currentValueEur += pos.current_value_eur * prop;
        stockReturnEur += pos.stock_return_eur * prop;
        dividendReturnEur += pos.dividend_return_eur * prop;
      }
      const totalReturnEur = stockReturnEur + dividendReturnEur;
      const totalPct = investedEur > 0 ? (totalReturnEur / investedEur) * 100 : 0;
      return { member, cashEur, cashUsd, investedEur, currentValueEur, stockReturnEur, dividendReturnEur, totalReturnEur, totalPct };
    });
  }, [members, cashEntries, cashMemberEntries, positions]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleExpand = (ticker: string) =>
    setExpandedTickers(prev => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });

  const handleAddSubmit = async () => {
    const ticker = form.ticker.trim().toUpperCase();
    const effectiveBroker = getEffectiveBroker(form.broker, form.brokerCustom);
    if (!ticker || !form.date || !form.price || !form.quantity) {
      toast({ title: "Campos obrigatórios", description: "Ticker, data, preço e quantidade são obrigatórios.", variant: "destructive" });
      return;
    }
    if (!effectiveBroker || effectiveBroker === "Outras" && !form.brokerCustom.trim()) {
      toast({ title: "Broker obrigatório", description: "Seleciona ou escreve o nome do broker.", variant: "destructive" });
      return;
    }
    const price = parseFloat(form.price);
    const quantity = parseFloat(form.quantity);
    if (isNaN(price) || price < 0 || isNaN(quantity) || quantity <= 0) {
      toast({ title: "Valores inválidos", description: "Preço e quantidade devem ser números positivos.", variant: "destructive" });
      return;
    }
    const company = companies.find(c => c.ticker.toUpperCase() === ticker);
    setSubmitting(true);
    try {
      const totalAmount = price * quantity;
      const isCashCurrency = form.currency === "EUR" || form.currency === "USD";
      const cashCurrency = form.currency as "EUR" | "USD";

      if (addType === "dividend") {
        await addDividend({
          ticker, company_id: company?.id ?? null,
          date: form.date, amount_per_share: price, quantity,
          currency: form.currency, notes: form.notes || null, broker: effectiveBroker,
        });
        if (isCashCurrency && members.length > 0) {
          const props = getMemberCashProportions(cashEntries, cashMemberEntries, members, effectiveBroker, cashCurrency);
          await addCashEntryWithMembers(
            { date: form.date, type: "dividend", ticker, amount: totalAmount, currency: cashCurrency, broker: effectiveBroker, notes: form.notes || null },
            props.map(p => ({ member_id: p.memberId, amount: parseFloat((totalAmount * p.proportion).toFixed(4)), percentage: parseFloat((p.proportion * 100).toFixed(2)) }))
          ).catch(() => {});
        }
      } else {
        await addTransaction({
          ticker, company_id: company?.id ?? null,
          type: addType, date: form.date,
          price_per_share: price, quantity,
          currency: form.currency, fees: 0, notes: form.notes || null, broker: effectiveBroker,
        });
        if (isCashCurrency && members.length > 0) {
          const cashAmount = addType === "buy" ? -totalAmount : totalAmount;
          const props = addType === "sell"
            ? getMemberTickerProportions(cashEntries, cashMemberEntries, members, ticker)
            : getMemberCashProportions(cashEntries, cashMemberEntries, members, effectiveBroker, cashCurrency);
          await addCashEntryWithMembers(
            { date: form.date, type: addType as "buy" | "sell", ticker, amount: cashAmount, currency: cashCurrency, broker: effectiveBroker, notes: form.notes || null },
            props.map(p => ({ member_id: p.memberId, amount: parseFloat((cashAmount * p.proportion).toFixed(4)), percentage: parseFloat((p.proportion * 100).toFixed(2)) }))
          ).catch(() => {});
        }
      }

      const label = addType === "dividend" ? "Dividendo" : addType === "buy" ? "Compra" : "Venda";
      toast({ title: "Guardado", description: `${label} de ${ticker} registada.` });
      setShowAdd(false);
      setForm(EMPTY_ADD_FORM);
      const { txns, divs } = await loadPortfolioData();
      await doFetchPrices(txns, divs);
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTx = async (id: string) => {
    try {
      await deleteTransaction(id);
      await loadPortfolioData();
      toast({ title: "Transação removida" });
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleDeleteDiv = async (id: string) => {
    try {
      await deleteDividend(id);
      await loadPortfolioData();
      toast({ title: "Dividendo removido" });
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleAddCashSubmit = async () => {
    const effectiveBroker = getEffectiveBroker(cashForm.broker, cashForm.brokerCustom);
    if (!cashForm.date || !cashForm.amount || !effectiveBroker) {
      toast({ title: "Campos obrigatórios", description: "Data, valor e broker são obrigatórios.", variant: "destructive" });
      return;
    }
    const totalAmount = parseFloat(cashForm.amount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      toast({ title: "Valor inválido", description: "O valor deve ser um número positivo.", variant: "destructive" });
      return;
    }
    // Valida repartição usando cashFormMembers (inclui fallback se DB ainda não criado)
    const memberTotal = cashFormMembers.reduce((s, m) => s + (parseFloat(cashForm.memberAmounts[m.id] || "0") || 0), 0);
    if (Math.abs(memberTotal - totalAmount) > 0.01) {
      toast({
        title: "Totais não coincidem",
        description: `Soma dos participantes (${fmtCcy(memberTotal, cashForm.currency)}) ≠ total (${fmtCcy(totalAmount, cashForm.currency)}).`,
        variant: "destructive",
      });
      return;
    }
    setSubmittingCash(true);
    try {
      const cashAmount = cashForm.type === "deposit" ? totalAmount : -totalAmount;
      // Apenas cria splits quando há membros reais na DB (IDs não começam com "_")
      const memberSplits = members.map(m => {
        const raw = parseFloat(cashForm.memberAmounts[m.id] || "0") || 0;
        const memberAmount = cashForm.type === "deposit" ? raw : -raw;
        return {
          member_id: m.id,
          amount: memberAmount,
          percentage: totalAmount > 0 ? parseFloat(((raw / totalAmount) * 100).toFixed(2)) : 0,
        };
      });
      await addCashEntryWithMembers(
        { date: cashForm.date, type: cashForm.type, ticker: null, amount: cashAmount, currency: cashForm.currency, broker: effectiveBroker, notes: cashForm.notes || null },
        memberSplits
      );
      const label = cashForm.type === "deposit" ? "Depósito" : "Levantamento";
      toast({ title: "Guardado", description: `${label} registado.` });
      setShowAddCash(false);
      setCashForm(EMPTY_CASH_FORM);
      await loadPortfolioData();
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSubmittingCash(false);
    }
  };

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2">
          <p className="text-sm font-medium text-destructive">Erro ao carregar portfolio</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground">
            Corre <code className="bg-secondary px-1 rounded text-[11px]">supabase/portfolio_tables.sql</code> no{" "}
            <strong>Supabase Dashboard → SQL Editor</strong> e recarrega a página.
          </p>
        </div>
      </AppLayout>
    );
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const totalPreview =
    form.price && form.quantity
      ? parseFloat(form.price || "0") * parseFloat(form.quantity || "0")
      : null;

  const cashFormTotal = parseFloat(cashForm.amount || "0") || 0;
  const cashMemberTotal = cashFormMembers.reduce(
    (s, m) => s + (parseFloat(cashForm.memberAmounts[m.id] || "0") || 0), 0
  );
  const cashMemberRemaining = cashFormTotal - cashMemberTotal;

  const memberStatsTotal = memberStats.length > 0 ? {
    cashEur: memberStats.reduce((s, m) => s + m.cashEur, 0),
    cashUsd: memberStats.reduce((s, m) => s + m.cashUsd, 0),
    investedEur: memberStats.reduce((s, m) => s + m.investedEur, 0),
    currentValueEur: memberStats.reduce((s, m) => s + m.currentValueEur, 0),
    stockReturnEur: memberStats.reduce((s, m) => s + m.stockReturnEur, 0),
    dividendReturnEur: memberStats.reduce((s, m) => s + m.dividendReturnEur, 0),
    totalReturnEur: memberStats.reduce((s, m) => s + m.totalReturnEur, 0),
  } : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              EUR/USD {eurUsd.toFixed(4)}
              {pricesLoading && <span className="ml-2 animate-pulse">· A atualizar preços…</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 px-2"
              onClick={() => doFetchPrices(transactions, dividends)} disabled={pricesLoading} title="Atualizar preços">
              {pricesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => { setCashForm(EMPTY_CASH_FORM); setShowAddCash(true); }}>
              <Wallet className="h-3.5 w-3.5" />Liquidez
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => { setForm(EMPTY_ADD_FORM); setAddType("buy"); setShowAdd(true); }}>
              <Plus className="h-3.5 w-3.5" />Registar
            </Button>
          </div>
        </div>

        {/* ── Liquidity card ──────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> Liquidez
          </p>
          {cashByBroker.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem registos de liquidez. Usa o botão "Liquidez" para registar depósitos.</p>
          ) : (
            <div className="flex flex-wrap gap-6">
              {cashByBroker.map(b => (
                <div key={b.broker}>
                  <p className="text-[11px] text-muted-foreground mb-0.5">{b.broker}</p>
                  {(b.eur !== 0 || b.usd === 0) && (
                    <p className={`font-mono text-sm font-bold ${b.eur >= 0 ? "text-foreground" : "text-negative"}`}>
                      {fmtCcy(b.eur, "EUR")}
                    </p>
                  )}
                  {b.usd !== 0 && (
                    <p className={`font-mono text-sm font-bold ${b.usd >= 0 ? "text-foreground" : "text-negative"}`}>
                      {fmtCcy(b.usd, "USD")}
                    </p>
                  )}
                </div>
              ))}
              {cashByBroker.length > 1 && (
                <div className="border-l border-border pl-6">
                  <p className="text-[11px] text-muted-foreground mb-0.5">Total</p>
                  {(() => {
                    const totalEur = cashByBroker.reduce((s, b) => s + b.eur, 0);
                    const totalUsd = cashByBroker.reduce((s, b) => s + b.usd, 0);
                    return (
                      <>
                        <p className={`font-mono text-sm font-bold ${totalEur >= 0 ? "text-foreground" : "text-negative"}`}>
                          {fmtCcy(totalEur, "EUR")}
                        </p>
                        {totalUsd !== 0 && (
                          <p className={`font-mono text-sm font-bold ${totalUsd >= 0 ? "text-foreground" : "text-negative"}`}>
                            {fmtCcy(totalUsd, "USD")}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Per-member breakdown */}
              {memberStats.length > 0 && memberStats.some(ms => ms.cashEur !== 0 || ms.cashUsd !== 0) && (() => {
                const totalEur = cashByBroker.reduce((s, b) => s + b.eur, 0);
                const totalUsd = cashByBroker.reduce((s, b) => s + b.usd, 0);
                return (
                  <div className="border-l border-border pl-6">
                    <p className="text-[11px] text-muted-foreground mb-1">Por participante</p>
                    {memberStats.map(ms => {
                      const pctEur = totalEur !== 0 ? (ms.cashEur / totalEur) * 100 : 0;
                      const pctUsd = totalUsd !== 0 ? (ms.cashUsd / totalUsd) * 100 : 0;
                      return (
                        <div key={ms.member.id} className="mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground w-14 shrink-0">{ms.member.name}</span>
                            <span className={`font-mono text-xs font-medium ${ms.cashEur >= 0 ? "text-foreground" : "text-negative"}`}>
                              {fmtCcy(ms.cashEur, "EUR")}
                            </span>
                            {totalEur !== 0 && (
                              <span className="text-[10px] text-muted-foreground">({pctEur.toFixed(1)}%)</span>
                            )}
                          </div>
                          {ms.cashUsd !== 0 && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="w-14 shrink-0" />
                              <span className={`font-mono text-xs font-medium ${ms.cashUsd >= 0 ? "text-foreground" : "text-negative"}`}>
                                {fmtCcy(ms.cashUsd, "USD")}
                              </span>
                              {totalUsd !== 0 && (
                                <span className="text-[10px] text-muted-foreground">({pctUsd.toFixed(1)}%)</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Totals ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Valor Investido", value: fmtEur(totals.investedEur), pct: null },
            { label: "Valor Atual", value: fmtEur(totals.currentEur), pct: null },
            { label: "Rent. Ações", value: fmtEur(totals.stockEur), pct: totals.stockPct },
            { label: "Rent. Dividendos", value: fmtEur(totals.divEur), pct: totals.divPct },
            { label: "Rent. Total", value: fmtEur(totals.totalEur), pct: totals.totalPct },
          ].map((card, i) => {
            const isReturn = card.pct !== null;
            const positive = isReturn && card.pct! >= 0;
            return (
              <div key={i} className="rounded-lg border border-border bg-card p-3">
                <p className="text-[11px] text-muted-foreground">{card.label}</p>
                <p className={`mt-1 font-mono text-sm font-bold ${isReturn ? (positive ? "text-positive" : "text-negative") : "text-foreground"}`}>
                  {isReturn && positive ? "+" : ""}{card.value}
                </p>
                {card.pct !== null && (
                  <p className={`font-mono text-[11px] ${positive ? "text-positive/80" : "text-negative/80"}`}>
                    {fmtPct(card.pct)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Member stats ─────────────────────────────────────────────────── */}
        {memberStats.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              Rentabilidade por Participante
            </p>
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {["Participante", "Liquidez EUR", "Liquidez USD", "Investido", "Valor Atual", "Rent. Ações", "Rent. Div.", "Rent. Total"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {memberStats.map(ms => (
                    <tr key={ms.member.id} className="border-b border-border/50">
                      <td className="px-3 py-2 text-xs font-medium text-foreground">{ms.member.name}</td>
                      <td className={`px-3 py-2 font-mono text-xs ${ms.cashEur >= 0 ? "text-blue-600 dark:text-blue-400" : "text-negative"}`}>
                        {fmtCcy(ms.cashEur, "EUR")}
                      </td>
                      <td className={`px-3 py-2 font-mono text-xs ${ms.cashUsd >= 0 ? "text-blue-600 dark:text-blue-400" : "text-negative"}`}>
                        {ms.cashUsd !== 0 ? fmtCcy(ms.cashUsd, "USD") : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{fmtEur(ms.investedEur)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{fmtEur(ms.currentValueEur)}</td>
                      <td className="px-3 py-2">
                        <ReturnCell eur={ms.stockReturnEur} pct={ms.investedEur > 0 ? (ms.stockReturnEur / ms.investedEur) * 100 : 0} />
                      </td>
                      <td className="px-3 py-2">
                        <ReturnCell eur={ms.dividendReturnEur} pct={ms.investedEur > 0 ? (ms.dividendReturnEur / ms.investedEur) * 100 : 0} />
                      </td>
                      <td className="px-3 py-2">
                        <ReturnCell eur={ms.totalReturnEur} pct={ms.totalPct} />
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  {memberStatsTotal && (
                    <tr className="bg-secondary/20 border-t border-border">
                      <td className="px-3 py-2 text-xs font-semibold text-foreground">Total</td>
                      <td className={`px-3 py-2 font-mono text-xs font-semibold ${memberStatsTotal.cashEur >= 0 ? "text-blue-600 dark:text-blue-400" : "text-negative"}`}>
                        {fmtCcy(memberStatsTotal.cashEur, "EUR")}
                      </td>
                      <td className={`px-3 py-2 font-mono text-xs font-semibold ${memberStatsTotal.cashUsd >= 0 ? "text-blue-600 dark:text-blue-400" : "text-negative"}`}>
                        {memberStatsTotal.cashUsd !== 0 ? fmtCcy(memberStatsTotal.cashUsd, "USD") : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{fmtEur(memberStatsTotal.investedEur)}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{fmtEur(memberStatsTotal.currentValueEur)}</td>
                      <td className="px-3 py-2">
                        <ReturnCell eur={memberStatsTotal.stockReturnEur} pct={memberStatsTotal.investedEur > 0 ? (memberStatsTotal.stockReturnEur / memberStatsTotal.investedEur) * 100 : 0} />
                      </td>
                      <td className="px-3 py-2">
                        <ReturnCell eur={memberStatsTotal.dividendReturnEur} pct={memberStatsTotal.investedEur > 0 ? (memberStatsTotal.dividendReturnEur / memberStatsTotal.investedEur) * 100 : 0} />
                      </td>
                      <td className="px-3 py-2">
                        <ReturnCell eur={memberStatsTotal.totalReturnEur} pct={memberStatsTotal.investedEur > 0 ? (memberStatsTotal.totalReturnEur / memberStatsTotal.investedEur) * 100 : 0} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Positions table ─────────────────────────────────────────────── */}
        {positions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 flex flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-foreground">Sem transações</p>
            <p className="mt-1 text-xs text-muted-foreground">Clica em "Registar" para adicionar a primeira transação.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="w-8 px-2" />
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Empresa</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Broker</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Qtd.</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">P.Médio</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Preço Atual</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Valor Atual</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Rent. Ações</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Rent. Div.</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Rent. Total</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => {
                  const expanded = expandedTickers.has(pos.ticker);
                  const closed = pos.current_qty === 0;
                  const currentVal = pos.current_price !== null ? pos.current_price * pos.current_qty : null;
                  return (
                    <Fragment key={pos.ticker}>
                      {/* Main row */}
                      <tr
                        className={`border-b border-border/50 hover:bg-accent/20 cursor-pointer transition-colors ${closed ? "opacity-60" : ""}`}
                        onClick={() => toggleExpand(pos.ticker)}
                      >
                        <td className="px-2 py-2.5 text-center text-muted-foreground">
                          {expanded
                            ? <ChevronDown className="h-3.5 w-3.5 mx-auto" />
                            : <ChevronRight className="h-3.5 w-3.5 mx-auto" />}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-xs font-medium text-foreground leading-tight">
                            {pos.company_name || pos.ticker}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] text-primary">{pos.ticker}</span>
                            {closed && (
                              <span className="rounded px-1 text-[9px] bg-secondary text-muted-foreground">Encerrada</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[11px] text-muted-foreground">{pos.broker ?? "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtQty(pos.current_qty)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">
                          {pos.wac > 0 ? fmtCcy(pos.wac, pos.currency) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">
                          {pos.current_price !== null
                            ? fmtCcy(pos.current_price, pos.currency)
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {currentVal !== null && pos.current_qty > 0 ? (
                            <div>
                              <div className="font-mono text-xs">{fmtCcy(currentVal, pos.currency)}</div>
                              {pos.currency !== "EUR" && (
                                <div className="font-mono text-[10px] text-muted-foreground">{fmtEur(pos.current_value_eur)}</div>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <ReturnCell eur={pos.stock_return_eur} pct={pos.stock_return_pct} />
                        </td>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <ReturnCell eur={pos.dividend_return_eur} pct={pos.dividend_return_pct} />
                        </td>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <ReturnCell eur={pos.total_return_eur} pct={pos.total_return_pct} />
                        </td>
                      </tr>

                      {/* Drill-down row */}
                      {expanded && (
                        <tr className="border-b border-border/30 bg-secondary/10">
                          <td colSpan={10} className="px-5 py-3">
                            <div className="space-y-4">

                              {/* Transactions */}
                              {pos.transactions.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                    Transações
                                  </p>
                                  <div className="rounded border border-border/60 overflow-x-auto">
                                    <table className="w-full min-w-[500px]">
                                      <thead>
                                        <tr className="bg-secondary/40 border-b border-border/60">
                                          {["Data", "Tipo", "Preço/ação", "Qtd.", "Total", "Moeda", "Broker", ""].map(h => (
                                            <th key={h} className="px-2.5 py-1.5 text-left text-[10px] font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {pos.transactions.map(tx => (
                                          <tr key={tx.id} className="border-b border-border/30 hover:bg-secondary/20 last:border-0">
                                            <td className="px-2.5 py-1.5 font-mono text-[11px]">{tx.date}</td>
                                            <td className="px-2.5 py-1.5">
                                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                tx.type === "buy"
                                                  ? "bg-positive/15 text-positive"
                                                  : "bg-negative/15 text-negative"
                                              }`}>
                                                {tx.type === "buy" ? "Compra" : "Venda"}
                                              </span>
                                            </td>
                                            <td className="px-2.5 py-1.5 font-mono text-[11px] text-right">{fmtCcy(tx.price_per_share, tx.currency)}</td>
                                            <td className="px-2.5 py-1.5 font-mono text-[11px] text-right">{fmtQty(tx.quantity)}</td>
                                            <td className="px-2.5 py-1.5 font-mono text-[11px] text-right">{fmtCcy(tx.price_per_share * tx.quantity, tx.currency)}</td>
                                            <td className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{tx.currency}</td>
                                            <td className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{tx.broker}</td>
                                            <td className="px-2.5 py-1.5 text-center">
                                              <button
                                                onClick={() => handleDeleteTx(tx.id)}
                                                className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Dividends */}
                              {pos.dividends.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                    Dividendos
                                  </p>
                                  <div className="rounded border border-border/60 overflow-x-auto">
                                    <table className="w-full min-w-[440px]">
                                      <thead>
                                        <tr className="bg-secondary/40 border-b border-border/60">
                                          {["Data", "Valor/ação", "Qtd.", "Total recebido", "Moeda", "Broker", ""].map(h => (
                                            <th key={h} className="px-2.5 py-1.5 text-left text-[10px] font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {pos.dividends.map(div => (
                                          <tr key={div.id} className="border-b border-border/30 hover:bg-secondary/20 last:border-0">
                                            <td className="px-2.5 py-1.5 font-mono text-[11px]">{div.date}</td>
                                            <td className="px-2.5 py-1.5 font-mono text-[11px] text-right">{fmtCcy(div.amount_per_share, div.currency)}</td>
                                            <td className="px-2.5 py-1.5 font-mono text-[11px] text-right">{fmtQty(div.quantity)}</td>
                                            <td className="px-2.5 py-1.5 font-mono text-[11px] text-right text-positive font-medium">
                                              +{fmtCcy(div.amount_per_share * div.quantity, div.currency)}
                                            </td>
                                            <td className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{div.currency}</td>
                                            <td className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{div.broker}</td>
                                            <td className="px-2.5 py-1.5 text-center">
                                              <button
                                                onClick={() => handleDeleteDiv(div.id)}
                                                className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {pos.transactions.length === 0 && pos.dividends.length === 0 && (
                                <p className="text-xs text-muted-foreground">Sem histórico.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Transaction Dialog ────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Registar transação</DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            {/* Type selector */}
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <div className="mt-1.5 flex gap-1.5">
                {(["buy", "sell", "dividend"] as AddType[]).map(t => (
                  <button key={t}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border ${
                      addType === t
                        ? t === "buy"
                          ? "bg-positive/15 text-positive border-positive/30"
                          : t === "sell"
                          ? "bg-negative/15 text-negative border-negative/30"
                          : "bg-primary/15 text-primary border-primary/30"
                        : "bg-secondary text-muted-foreground border-transparent hover:bg-accent"
                    }`}
                    onClick={() => setAddType(t)}>
                    {t === "buy" ? "Compra" : t === "sell" ? "Venda" : "Dividendo"}
                  </button>
                ))}
              </div>
            </div>

            {/* Ticker */}
            <div>
              <label className="text-xs text-muted-foreground">Ticker</label>
              <Input
                className="mt-1 h-8 text-xs uppercase font-mono"
                placeholder="ex: AAPL"
                list="portfolio-ticker-list"
                value={form.ticker}
                onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))}
              />
              <datalist id="portfolio-ticker-list">
                {companies.map(c => (
                  <option key={c.ticker} value={c.ticker}>{c.name}</option>
                ))}
              </datalist>
            </div>

            {/* Date + Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Data</label>
                <Input type="date" className="mt-1 h-8 text-xs" value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Moeda</label>
                <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "EUR", "GBP", "CHF"].map(c => (
                      <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Price + Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  {addType === "dividend" ? "Valor por ação" : "Preço por ação"}
                </label>
                <Input type="number" step="0.0001" min="0" className="mt-1 h-8 text-xs font-mono"
                  placeholder="0.00" value={form.price}
                  onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Quantidade</label>
                <Input type="number" step="0.0001" min="0.0001" className="mt-1 h-8 text-xs font-mono"
                  placeholder="0" value={form.quantity}
                  onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
              </div>
            </div>

            {/* Total preview */}
            {totalPreview !== null && totalPreview > 0 && (
              <p className="text-[11px] text-muted-foreground text-right">
                Total: <span className="font-mono font-semibold text-foreground">
                  {fmtCcy(totalPreview, form.currency)}
                </span>
              </p>
            )}

            {/* Broker */}
            <div>
              <label className="text-xs text-muted-foreground">Broker *</label>
              <Select value={form.broker} onValueChange={v => setForm(p => ({ ...p, broker: v }))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Selecionar broker" /></SelectTrigger>
                <SelectContent>
                  {BROKERS.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.broker === "Outras" && (
                <Input className="mt-1.5 h-8 text-xs" placeholder="Nome do broker"
                  value={form.brokerCustom}
                  onChange={e => setForm(p => ({ ...p, brokerCustom: e.target.value }))} />
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground">Notas (opcional)</label>
              <Input className="mt-1 h-8 text-xs" placeholder=""
                value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" className="text-xs h-8"
              onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button size="sm" className="text-xs h-8"
              onClick={handleAddSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Cash Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showAddCash} onOpenChange={setShowAddCash}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Registar Liquidez</DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-1 overflow-y-auto max-h-[70vh] pr-1">
            {/* Type */}
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <div className="mt-1.5 flex gap-1.5">
                {(["deposit", "withdrawal"] as const).map(t => (
                  <button key={t}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border ${
                      cashForm.type === t
                        ? t === "deposit"
                          ? "bg-positive/15 text-positive border-positive/30"
                          : "bg-negative/15 text-negative border-negative/30"
                        : "bg-secondary text-muted-foreground border-transparent hover:bg-accent"
                    }`}
                    onClick={() => setCashForm(p => ({ ...p, type: t }))}>
                    {t === "deposit" ? "Depósito" : "Levantamento"}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Data</label>
                <Input type="date" className="mt-1 h-8 text-xs" value={cashForm.date}
                  onChange={e => setCashForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Moeda</label>
                <Select value={cashForm.currency} onValueChange={v => setCashForm(p => ({ ...p, currency: v as "EUR" | "USD" }))}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR" className="text-xs">EUR</SelectItem>
                    <SelectItem value="USD" className="text-xs">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-muted-foreground">Valor total</label>
              <Input type="number" step="0.01" min="0" className="mt-1 h-8 text-xs font-mono"
                placeholder="0.00" value={cashForm.amount}
                onChange={e => setCashForm(p => ({ ...p, amount: e.target.value }))} />
            </div>

            {/* Broker */}
            <div>
              <label className="text-xs text-muted-foreground">Broker *</label>
              <Select value={cashForm.broker} onValueChange={v => setCashForm(p => ({ ...p, broker: v }))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Selecionar broker" /></SelectTrigger>
                <SelectContent>
                  {BROKERS.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                </SelectContent>
              </Select>
              {cashForm.broker === "Outras" && (
                <Input className="mt-1.5 h-8 text-xs" placeholder="Nome do broker"
                  value={cashForm.brokerCustom}
                  onChange={e => setCashForm(p => ({ ...p, brokerCustom: e.target.value }))} />
              )}
            </div>

            {/* Member amounts — sempre visível */}
            <div className="rounded-md border border-border/60 bg-secondary/20 p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-foreground">
                  Repartição por participante *
                  {members.length === 0 && (
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(corre o SQL para guardar na DB)</span>
                  )}
                </label>
                {cashFormTotal > 0 && (
                  <button
                    className="text-[10px] text-primary hover:underline"
                    onClick={() => {
                      const each = (cashFormTotal / cashFormMembers.length).toFixed(2);
                      setCashForm(p => ({
                        ...p,
                        memberAmounts: Object.fromEntries(cashFormMembers.map(m => [m.id, each])),
                      }));
                    }}>
                    Dividir igualmente
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {cashFormMembers.map(m => {
                  const memberAmt = parseFloat(cashForm.memberAmounts[m.id] || "0") || 0;
                  const pct = cashFormTotal > 0 ? (memberAmt / cashFormTotal) * 100 : 0;
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className="text-xs text-foreground w-14 shrink-0">{m.name}</span>
                      <Input
                        type="number" step="0.01" min="0"
                        className="h-7 text-xs font-mono"
                        placeholder="0.00"
                        value={cashForm.memberAmounts[m.id] || ""}
                        onChange={e => setCashForm(p => ({
                          ...p,
                          memberAmounts: { ...p.memberAmounts, [m.id]: e.target.value },
                        }))}
                      />
                      <span className="text-[11px] font-mono w-11 text-right shrink-0 text-muted-foreground">
                        {cashFormTotal > 0 ? `${pct.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">
                  Soma: <span className="font-mono">{fmtCcy(cashMemberTotal, cashForm.currency)}</span>
                </span>
                {cashFormTotal > 0 && (
                  <span className={`text-[11px] font-mono font-medium ${Math.abs(cashMemberRemaining) < 0.01 ? "text-positive" : "text-negative"}`}>
                    {Math.abs(cashMemberRemaining) < 0.01
                      ? "✓ Total correto"
                      : `Diferença: ${fmtCcy(cashMemberRemaining, cashForm.currency)}`}
                  </span>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground">Notas (opcional)</label>
              <Input className="mt-1 h-8 text-xs" placeholder=""
                value={cashForm.notes}
                onChange={e => setCashForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" className="text-xs h-8"
              onClick={() => setShowAddCash(false)}>Cancelar</Button>
            <Button size="sm" className="text-xs h-8"
              onClick={handleAddCashSubmit} disabled={submittingCash}>
              {submittingCash && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
