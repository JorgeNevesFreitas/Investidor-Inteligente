import { useState, useEffect, useMemo, Fragment } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

function memberColor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("dinis")) return { bg: "bg-teal-600", bar: "bg-teal-500", dot: "bg-teal-500" };
  if (n.includes("mariana")) return { bg: "bg-purple-600", bar: "bg-purple-500", dot: "bg-purple-500" };
  return { bg: "bg-blue-600", bar: "bg-blue-500", dot: "bg-blue-500" };
}

function MemberAvatar({ name }: { name: string }) {
  const initials = name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  const { bg } = memberColor(name);
  return (
    <div className={`flex items-center justify-center w-9 h-9 rounded-full ${bg} text-white text-xs font-bold shrink-0`}>
      {initials}
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

  const [members, setMembers] = useState<PortfolioMember[]>([]);
  const [cashEntries, setCashEntries] = useState<PortfolioCash[]>([]);
  const [cashMemberEntries, setCashMemberEntries] = useState<PortfolioCashMember[]>([]);
  const [showAddCash, setShowAddCash] = useState(false);
  const [cashForm, setCashForm] = useState<CashForm>(EMPTY_CASH_FORM);
  const [submittingCash, setSubmittingCash] = useState(false);

  const [activeTab, setActiveTab] = useState<string>("todas");
  const [expandedPortfolioCard, setExpandedPortfolioCard] = useState(false);

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

  const cashFormMembers: PortfolioMember[] = useMemo(() =>
    members.length > 0 ? members : [
      { id: "_vjf", name: "V&J",     created_at: "" },
      { id: "_din", name: "Dinis",   created_at: "" },
      { id: "_mar", name: "Mariana", created_at: "" },
    ],
    [members]
  );

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

  const fxNeutralTotal = useMemo(() =>
    positions.reduce((s, p) => {
      const factor = p.currency !== "EUR" ? eurUsd : 1;
      return s + (p.stock_return_eur + p.dividend_return_eur) * factor;
    }, 0),
    [positions, eurUsd]
  );

  const filteredPositions = useMemo(() => {
    if (activeTab === "encerradas") return positions.filter(p => p.current_qty === 0);
    if (activeTab === "todas") return positions.filter(p => p.current_qty > 0);
    const member = members.find(m => m.name === activeTab);
    if (!member) return positions.filter(p => p.current_qty > 0);
    return positions.filter(p => {
      if (p.current_qty === 0) return false;
      const props = getMemberTickerProportions(cashEntries, cashMemberEntries, members, p.ticker);
      return (props.find(pr => pr.memberId === member.id)?.proportion ?? 0) > 0.001;
    });
  }, [activeTab, positions, members, cashEntries, cashMemberEntries]);

  // Map ticker → member proportion for the active member tab (null when not a member tab)
  const activeMemberProportions = useMemo(() => {
    const member = members.find(m => m.name === activeTab);
    if (!member) return null;
    const map = new Map<string, number>();
    for (const pos of positions) {
      const props = getMemberTickerProportions(cashEntries, cashMemberEntries, members, pos.ticker);
      const prop = props.find(p => p.memberId === member.id)?.proportion ?? 0;
      map.set(pos.ticker, prop);
    }
    return map;
  }, [activeTab, positions, members, cashEntries, cashMemberEntries]);

  // FX neutral return and FX effect per member (for card 4 tooltip)
  const memberFxStats = useMemo(() => {
    if (members.length === 0) return [];
    return members.map(member => {
      const fxNeutralEur = positions.reduce((s, pos) => {
        const props = getMemberTickerProportions(cashEntries, cashMemberEntries, members, pos.ticker);
        const prop = props.find(p => p.memberId === member.id)?.proportion ?? 0;
        const factor = pos.currency !== "EUR" ? eurUsd : 1;
        return s + (pos.stock_return_eur + pos.dividend_return_eur) * prop * factor;
      }, 0);
      return { memberId: member.id, fxNeutralEur };
    });
  }, [members, positions, cashEntries, cashMemberEntries, eurUsd]);

  // Total deposited EUR (sum of all deposit-type cash entries converted to EUR)
  const totalDepositedEur = useMemo(() => {
    return cashEntries
      .filter(e => e.type === "deposit")
      .reduce((s, e) => s + (e.currency === "EUR" ? e.amount : e.amount / eurUsd), 0);
  }, [cashEntries, eurUsd]);

  // Per-member: deposited, current portfolio value, gain/loss
  const memberPortfolioStats = useMemo(() => {
    if (members.length === 0) return [];
    return members.map(member => {
      const depositedEur = cashEntries
        .filter(e => e.type === "deposit")
        .reduce((s, e) => {
          const memberEntry = cashMemberEntries.find(
            cm => cm.cash_id === e.id && cm.member_id === member.id
          );
          if (!memberEntry) return s;
          return s + (e.currency === "EUR" ? memberEntry.amount : memberEntry.amount / eurUsd);
        }, 0);
      const ms = memberStats.find(m => m.member.id === member.id);
      const currentValueEur = ms
        ? ms.currentValueEur + ms.cashEur + ms.cashUsd / eurUsd
        : 0;
      const gainLossEur = currentValueEur - depositedEur;
      const gainLossPct = depositedEur > 0 ? (gainLossEur / depositedEur) * 100 : 0;
      return { member, depositedEur, currentValueEur, gainLossEur, gainLossPct };
    });
  }, [members, cashEntries, cashMemberEntries, memberStats, eurUsd]);

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

  const totalCashEur = cashByBroker.reduce((s, b) => s + b.eur + b.usd / eurUsd, 0);
  const totalPortfolioEur = totals.currentEur + totalCashEur;
  const fxEffect = totals.totalEur - fxNeutralTotal;
  const portfolioGainLoss = totalPortfolioEur - totalDepositedEur;
  const portfolioGainLossPct = totalDepositedEur > 0 ? (portfolioGainLoss / totalDepositedEur) * 100 : 0;

  const totalMemberPortfolioValue = memberStats.reduce(
    (s, ms) => s + ms.currentValueEur + ms.cashEur + ms.cashUsd / eurUsd, 0
  );

  const tabs = [
    { id: "todas", label: "Todas as posições" },
    ...members.map(m => ({ id: m.name, label: m.name })),
    { id: "encerradas", label: "Encerradas" },
  ];

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
              onClick={() => doFetchPrices(transactions, dividends)} disabled={pricesLoading} title="Refresh de preços">
              {pricesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => { setCashForm(EMPTY_CASH_FORM); setShowAddCash(true); }}>
              <Wallet className="h-3.5 w-3.5" />Registar liquidez
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => { setForm(EMPTY_ADD_FORM); setAddType("buy"); setShowAdd(true); }}>
              <Plus className="h-3.5 w-3.5" />Registar transação
            </Button>
          </div>
        </div>

        {/* ── Summary cards ───────────────────────────────────────────────── */}
        <div className="space-y-3">
        <TooltipProvider delayDuration={300}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Card 1 — Carteira total */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`rounded-xl border bg-card p-4 cursor-pointer select-none transition-colors ${expandedPortfolioCard ? "border-primary/40 shadow-sm" : "border-border"}`}
                  onClick={() => setExpandedPortfolioCard(v => !v)}
                >
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Carteira Total</p>
                  <p className="font-mono text-lg font-bold text-foreground">{fmtEur(totalPortfolioEur)}</p>
                  <div className="mt-2.5 pt-2.5 border-t border-border/50 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-muted-foreground">Depositado</span>
                      <span className="font-mono text-[11px] font-medium text-foreground">{fmtEur(totalDepositedEur)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-muted-foreground">Mais/menos valia</span>
                      <span className={`font-mono text-[11px] font-medium ${portfolioGainLoss >= 0 ? "text-positive" : "text-negative"}`}>
                        {portfolioGainLoss >= 0 ? "+" : ""}{fmtEur(portfolioGainLoss)}
                        <span className="text-[10px] ml-1 opacity-75">({portfolioGainLossPct >= 0 ? "+" : ""}{portfolioGainLossPct.toFixed(1)}%)</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expandedPortfolioCard ? "rotate-180" : ""}`} />
                  </div>
                </div>
              </TooltipTrigger>
              {memberStats.length > 0 && (
                <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Por investidor</p>
                  <div className="space-y-1">
                    {memberStats.map(ms => {
                      const tv = ms.currentValueEur + ms.cashEur + ms.cashUsd / eurUsd;
                      const pct = totalMemberPortfolioValue > 0 ? (tv / totalMemberPortfolioValue) * 100 : 0;
                      const { dot } = memberColor(ms.member.name);
                      return (
                        <div key={ms.member.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                          <span className="w-16 shrink-0">{ms.member.name}</span>
                          <span className="font-mono font-medium">{fmtEur(tv)}</span>
                          <span className="font-mono text-muted-foreground ml-1">{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>

            {/* Card 2 — Rentabilidade total */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-xl border border-border bg-card p-4 cursor-default">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Rentabilidade Total</p>
                  <p className={`font-mono text-lg font-bold ${totals.totalEur >= 0 ? "text-positive" : "text-negative"}`}>
                    {totals.totalEur >= 0 ? "+" : ""}{fmtEur(totals.totalEur)}
                  </p>
                  <p className={`font-mono text-sm mt-0.5 ${totals.totalPct >= 0 ? "text-positive/80" : "text-negative/80"}`}>
                    {fmtPct(totals.totalPct)}
                  </p>
                  <p className="mt-2.5 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground">
                    Valor atual{" "}
                    <span className="font-mono font-medium text-foreground">{fmtEur(totals.currentEur)}</span>
                  </p>
                </div>
              </TooltipTrigger>
              {memberStats.length > 0 && (
                <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Por investidor</p>
                  <div className="space-y-1">
                    {memberStats.map(ms => {
                      const { dot } = memberColor(ms.member.name);
                      return (
                        <div key={ms.member.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                          <span className="w-16 shrink-0">{ms.member.name}</span>
                          <span className={`font-mono font-medium ${ms.totalReturnEur >= 0 ? "text-positive" : "text-negative"}`}>
                            {ms.totalReturnEur >= 0 ? "+" : ""}{fmtEur(ms.totalReturnEur)}
                          </span>
                          <span className={`font-mono text-[10px] ml-1 ${ms.totalPct >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                            {fmtPct(ms.totalPct)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>

            {/* Card 3 — Por tipo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-xl border border-border bg-card p-4 cursor-default">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Por Tipo</p>
                  <div className="space-y-2.5">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Ações</p>
                      <p className={`font-mono text-sm font-bold ${totals.stockEur >= 0 ? "text-positive" : "text-negative"}`}>
                        {totals.stockEur >= 0 ? "+" : ""}{fmtEur(totals.stockEur)}
                      </p>
                      <p className={`font-mono text-[10px] ${totals.stockPct >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                        {fmtPct(totals.stockPct)}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-border/40">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Dividendos</p>
                      <p className={`font-mono text-sm font-bold ${totals.divEur >= 0 ? "text-positive" : "text-negative"}`}>
                        {totals.divEur >= 0 ? "+" : ""}{fmtEur(totals.divEur)}
                      </p>
                      <p className={`font-mono text-[10px] ${totals.divPct >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                        {fmtPct(totals.divPct)}
                      </p>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              {memberStats.length > 0 && (
                <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Ações por investidor</p>
                      <div className="space-y-1">
                        {memberStats.map(ms => {
                          const { dot } = memberColor(ms.member.name);
                          return (
                            <div key={ms.member.id} className="flex items-center gap-2 text-[11px]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                              <span className="w-16 shrink-0">{ms.member.name}</span>
                              <span className={`font-mono font-medium ${ms.stockReturnEur >= 0 ? "text-positive" : "text-negative"}`}>
                                {ms.stockReturnEur >= 0 ? "+" : ""}{fmtEur(ms.stockReturnEur)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-border/40">
                      <p className="text-[10px] text-muted-foreground mb-1">Dividendos por investidor</p>
                      <div className="space-y-1">
                        {memberStats.map(ms => {
                          const { dot } = memberColor(ms.member.name);
                          return (
                            <div key={ms.member.id} className="flex items-center gap-2 text-[11px]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                              <span className="w-16 shrink-0">{ms.member.name}</span>
                              <span className={`font-mono font-medium ${ms.dividendReturnEur >= 0 ? "text-positive" : "text-negative"}`}>
                                {ms.dividendReturnEur >= 0 ? "+" : ""}{fmtEur(ms.dividendReturnEur)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </TooltipContent>
              )}
            </Tooltip>

            {/* Card 4 — Efeito câmbio */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-xl border border-border bg-card p-4 cursor-default">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Efeito Câmbio</p>
                    <span className="text-[10px] font-mono text-muted-foreground bg-secondary/60 rounded px-1.5 py-0.5">
                      {eurUsd.toFixed(4)}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Sem câmbio</p>
                      <p className={`font-mono text-sm font-bold ${fxNeutralTotal >= 0 ? "text-positive" : "text-negative"}`}>
                        {fxNeutralTotal >= 0 ? "+" : ""}{fmtEur(fxNeutralTotal)}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-border/40">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Efeito câmbio</p>
                      <p className={`font-mono text-sm font-bold ${fxEffect >= 0 ? "text-positive" : "text-negative"}`}>
                        {fxEffect >= 0 ? "+" : ""}{fmtEur(fxEffect)}
                      </p>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              {memberStats.length > 0 && memberFxStats.length > 0 && (
                <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Por investidor</p>
                  <div className="space-y-1">
                    {memberStats.map(ms => {
                      const fxStat = memberFxStats.find(s => s.memberId === ms.member.id);
                      const memberFxNeutral = fxStat?.fxNeutralEur ?? 0;
                      const memberFxEff = ms.totalReturnEur - memberFxNeutral;
                      const { dot } = memberColor(ms.member.name);
                      return (
                        <div key={ms.member.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                          <span className="w-16 shrink-0">{ms.member.name}</span>
                          <span className={`font-mono font-medium ${memberFxNeutral >= 0 ? "text-positive" : "text-negative"}`}>
                            {memberFxNeutral >= 0 ? "+" : ""}{fmtEur(memberFxNeutral)}
                          </span>
                          <span className={`font-mono text-[10px] ml-1 ${memberFxEff >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                            FX: {memberFxEff >= 0 ? "+" : ""}{fmtEur(memberFxEff)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </TooltipProvider>

        {/* ── Card 1 drill-down ───────────────────────────────────────────── */}
        <div
          style={{ maxHeight: expandedPortfolioCard ? "400px" : "0px", overflow: "hidden", transition: "max-height 200ms ease" }}
        >
          <div className="rounded-xl border border-primary/20 bg-card p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Discriminação por investidor</p>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/50">
                  <th className="pb-2 font-medium">Investidor</th>
                  <th className="pb-2 font-medium text-right">Capital Depositado</th>
                  <th className="pb-2 font-medium text-right">Valor Atual</th>
                  <th className="pb-2 font-medium text-right">Mais/Menos Valia</th>
                  <th className="pb-2 font-medium text-right">Rentabilidade</th>
                </tr>
              </thead>
              <tbody>
                {memberPortfolioStats.map(mps => {
                  const { dot } = memberColor(mps.member.name);
                  return (
                    <tr key={mps.member.id} className="border-b border-border/30 last:border-0">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                          <span>{mps.member.name}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono">{fmtEur(mps.depositedEur)}</td>
                      <td className="py-2 text-right font-mono">{fmtEur(mps.currentValueEur)}</td>
                      <td className={`py-2 text-right font-mono ${mps.gainLossEur >= 0 ? "text-positive" : "text-negative"}`}>
                        {mps.gainLossEur >= 0 ? "+" : ""}{fmtEur(mps.gainLossEur)}
                      </td>
                      <td className={`py-2 text-right font-mono ${mps.gainLossPct >= 0 ? "text-positive" : "text-negative"}`}>
                        {mps.gainLossPct >= 0 ? "+" : ""}{mps.gainLossPct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
                {memberPortfolioStats.length > 0 && (
                  <tr className="border-t border-border/60 font-semibold">
                    <td className="pt-2 text-muted-foreground">Total</td>
                    <td className="pt-2 text-right font-mono">{fmtEur(totalDepositedEur)}</td>
                    <td className="pt-2 text-right font-mono">{fmtEur(totalPortfolioEur)}</td>
                    <td className={`pt-2 text-right font-mono ${portfolioGainLoss >= 0 ? "text-positive" : "text-negative"}`}>
                      {portfolioGainLoss >= 0 ? "+" : ""}{fmtEur(portfolioGainLoss)}
                    </td>
                    <td className={`pt-2 text-right font-mono ${portfolioGainLossPct >= 0 ? "text-positive" : "text-negative"}`}>
                      {portfolioGainLossPct >= 0 ? "+" : ""}{portfolioGainLossPct.toFixed(2)}%
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>{/* end space-y-3 wrapper */}

        {/* ── Middle row: investors + cash ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Panel: Por investidor */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Por Investidor</p>
            {memberStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados de participantes.</p>
            ) : (
              <div className="space-y-3">
                {memberStats.map(ms => {
                  const { bar } = memberColor(ms.member.name);
                  const memberCashEur = ms.cashEur + ms.cashUsd / eurUsd;
                  const totalValue = ms.currentValueEur + memberCashEur;
                  const weight = totalMemberPortfolioValue > 0
                    ? (totalValue / totalMemberPortfolioValue) * 100
                    : 0;
                  return (
                    <div key={ms.member.id} className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MemberAvatar name={ms.member.name} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{ms.member.name}</p>
                            <p className="text-[10px] text-muted-foreground">{weight.toFixed(1)}% da carteira</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-sm font-bold text-foreground">{fmtEur(totalValue)}</p>
                          <p className={`font-mono text-xs ${ms.totalReturnEur >= 0 ? "text-positive" : "text-negative"}`}>
                            {ms.totalReturnEur >= 0 ? "+" : ""}{fmtEur(ms.totalReturnEur)}
                          </p>
                          <p className={`font-mono text-[10px] ${ms.totalPct >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                            {fmtPct(ms.totalPct)}
                          </p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2.5 w-full bg-secondary/60 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${bar}`}
                          style={{ width: `${Math.min(100, weight)}%` }}
                        />
                      </div>

                      {/* Detail row */}
                      <div className="mt-2.5 grid grid-cols-3 gap-x-2 pt-2 border-t border-border/40">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Investido</p>
                          <p className="font-mono text-xs font-medium text-foreground">{fmtEur(ms.investedEur)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Liquidez</p>
                          <p className="font-mono text-xs font-medium text-foreground">{fmtEur(memberCashEur)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Rent. ações</p>
                          <p className={`font-mono text-xs font-medium ${ms.stockReturnEur >= 0 ? "text-positive" : "text-negative"}`}>
                            {ms.stockReturnEur >= 0 ? "+" : ""}{fmtEur(ms.stockReturnEur)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Panel: Liquidez por broker */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Liquidez por Broker</p>
              <span className="font-mono text-sm font-bold text-foreground">{fmtEur(totalCashEur)}</span>
            </div>
            {cashByBroker.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem registos de liquidez. Usa "Registar liquidez" para adicionar depósitos.
              </p>
            ) : (
              <div className="space-y-2.5">
                {cashByBroker.map(b => {
                  const brokerTotalEur = b.eur + b.usd / eurUsd;
                  return (
                    <div key={b.broker} className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-foreground">{b.broker}</p>
                        <p className="font-mono text-xs font-bold text-foreground">{fmtEur(brokerTotalEur)}</p>
                      </div>
                      <div className="space-y-0.5">
                        {(b.eur !== 0 || b.usd === 0) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">EUR</span>
                            <span className={`font-mono text-[11px] font-medium ${b.eur >= 0 ? "text-foreground" : "text-negative"}`}>
                              {fmtCcy(b.eur, "EUR")}
                            </span>
                          </div>
                        )}
                        {b.usd !== 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">USD</span>
                            <div className="flex items-baseline gap-1.5">
                              <span className={`font-mono text-[11px] font-medium ${b.usd >= 0 ? "text-foreground" : "text-negative"}`}>
                                {fmtCcy(b.usd, "USD")}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                ≈ {fmtEur(b.usd / eurUsd)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Positions section ───────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Tab bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-0.5 bg-secondary/40 rounded-lg p-1">
              {tabs.map(tab => {
                const isMember = members.some(m => m.name === tab.id);
                const { dot } = isMember ? memberColor(tab.id) : { dot: "" };
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeTab === tab.id
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isMember && (
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    )}
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {filteredPositions.length} posição{filteredPositions.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Table */}
          {filteredPositions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-foreground">
                {activeTab === "encerradas" ? "Sem posições encerradas" : "Sem posições"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === "encerradas"
                  ? "As posições encerradas aparecerão aqui."
                  : "Clica em \"Registar transação\" para adicionar a primeira transação."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="w-8 px-2" />
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Empresa</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Broker</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Qtd.</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">P. Médio</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Preço Atual</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Valor Atual</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Rent. Ações</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Dividendos</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Rent. Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPositions.map(pos => {
                    const expanded = expandedTickers.has(pos.ticker);
                    const closed = pos.current_qty === 0;
                    const memberProp = activeMemberProportions?.get(pos.ticker) ?? 1;
                    const displayQty = pos.current_qty * memberProp;
                    const currentVal = pos.current_price !== null ? pos.current_price * pos.current_qty : null;
                    const displayCurrentVal = currentVal !== null ? currentVal * memberProp : null;
                    const displayCurrentValueEur = pos.current_value_eur * memberProp;
                    const displayStockReturnEur = pos.stock_return_eur * memberProp;
                    const displayDivReturnEur = pos.dividend_return_eur * memberProp;
                    const displayTotalReturnEur = pos.total_return_eur * memberProp;
                    return (
                      <Fragment key={pos.ticker}>
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
                          <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtQty(displayQty)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {pos.wac > 0 ? fmtCcy(pos.wac, pos.currency) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {pos.current_price !== null
                              ? fmtCcy(pos.current_price, pos.currency)
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {displayCurrentVal !== null && displayQty > 0 ? (
                              <div>
                                <div className="font-mono text-xs">{fmtCcy(displayCurrentVal, pos.currency)}</div>
                                {pos.currency !== "EUR" && (
                                  <div className="font-mono text-[10px] text-muted-foreground">{fmtEur(displayCurrentValueEur)}</div>
                                )}
                              </div>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <ReturnCell eur={displayStockReturnEur} pct={pos.stock_return_pct} />
                          </td>
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <ReturnCell eur={displayDivReturnEur} pct={pos.dividend_return_pct} />
                          </td>
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <ReturnCell eur={displayTotalReturnEur} pct={pos.total_return_pct} />
                          </td>
                        </tr>

                        {/* Drill-down row */}
                        {expanded && (
                          <tr className="border-b border-border/30 bg-secondary/10">
                            <td colSpan={10} className="px-5 py-3">
                              <div className="space-y-4">

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
      </div>

      {/* ── Add Transaction Dialog ────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Registar transação</DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
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

            {totalPreview !== null && totalPreview > 0 && (
              <p className="text-[11px] text-muted-foreground text-right">
                Total: <span className="font-mono font-semibold text-foreground">
                  {fmtCcy(totalPreview, form.currency)}
                </span>
              </p>
            )}

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

            <div>
              <label className="text-xs text-muted-foreground">Valor total</label>
              <Input type="number" step="0.01" min="0" className="mt-1 h-8 text-xs font-mono"
                placeholder="0.00" value={cashForm.amount}
                onChange={e => setCashForm(p => ({ ...p, amount: e.target.value }))} />
            </div>

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
