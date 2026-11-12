import { useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { PortfolioTransaction, PortfolioDividend, PortfolioCash } from "@/lib/portfolioService";
import { DBCompany } from "@/lib/financialDataService";
import { CompanyLinksMenu } from "./CompanyLinksMenu";
import { fmtCcy, fmtQty } from "./shared";

// "Extrato" tab: a unified, filterable statement of every portfolio movement — transactions,
// dividends and cash movements (deposits, withdrawals, FX adjustments). portfolio_cash rows of
// type buy/sell/dividend are skipped: they mirror transactions/dividends already listed.

type StatementKind = "deposit" | "withdrawal" | "buy" | "sell" | "gift" | "dividend" | "fx_adjustment";

const KIND_LABELS: Record<StatementKind, string> = {
  deposit: "Depósito",
  withdrawal: "Levantamento",
  buy: "Compra",
  sell: "Venda",
  gift: "Oferta",
  dividend: "Dividendo",
  fx_adjustment: "Ajuste cambial",
};

const KIND_CHIP_LABELS: Record<StatementKind, string> = {
  deposit: "Depósitos",
  withdrawal: "Levantamentos",
  buy: "Compras",
  sell: "Vendas",
  gift: "Ofertas",
  dividend: "Dividendos",
  fx_adjustment: "Ajustes cambiais",
};

const KIND_BADGE: Record<StatementKind, string> = {
  deposit: "bg-positive/15 text-positive",
  withdrawal: "bg-negative/15 text-negative",
  buy: "bg-blue-500/15 text-blue-500",
  sell: "bg-amber-500/15 text-amber-500",
  gift: "bg-purple-500/15 text-purple-500",
  dividend: "bg-teal-500/15 text-teal-500",
  fx_adjustment: "bg-primary/15 text-primary",
};

const KIND_ORDER: StatementKind[] = ["deposit", "withdrawal", "buy", "sell", "gift", "dividend", "fx_adjustment"];

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ALL = "__all__";

type StatementSource =
  | { kind: "tx"; tx: PortfolioTransaction }
  | { kind: "div"; div: PortfolioDividend }
  | { kind: "cash"; entry: PortfolioCash };

interface StatementRow {
  key: string;
  kind: StatementKind;
  date: string;
  createdAt: string;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  amount: number;
  currency: string;
  broker: string;
  notes: string | null;
  source: StatementSource;
}

interface StatementTableProps {
  transactions: PortfolioTransaction[];
  dividends: PortfolioDividend[];
  cashEntries: PortfolioCash[];
  companyByTicker: Map<string, DBCompany>;
  onDeleteTransaction: (tx: PortfolioTransaction) => Promise<void> | void;
  onDeleteDividend: (div: PortfolioDividend) => Promise<void> | void;
  onDeleteCashEntry: (entry: PortfolioCash) => Promise<void> | void;
}

function buildRows(transactions: PortfolioTransaction[], dividends: PortfolioDividend[], cashEntries: PortfolioCash[]): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const tx of transactions) {
    const isGift = tx.type === "buy" && tx.is_gift;
    const gross = tx.price_per_share * tx.quantity;
    rows.push({
      key: `tx:${tx.id}`,
      kind: isGift ? "gift" : tx.type,
      date: tx.date,
      createdAt: tx.created_at ?? "",
      ticker: tx.ticker,
      quantity: tx.quantity,
      price: tx.price_per_share,
      amount: isGift ? 0 : tx.type === "buy" ? -gross : gross,
      currency: tx.currency,
      broker: tx.broker,
      notes: tx.notes,
      source: { kind: "tx", tx },
    });
  }
  for (const div of dividends) {
    rows.push({
      key: `div:${div.id}`,
      kind: "dividend",
      date: div.date,
      createdAt: div.created_at ?? "",
      ticker: div.ticker,
      quantity: div.quantity,
      price: div.amount_per_share,
      amount: div.amount_per_share * div.quantity,
      currency: div.currency,
      broker: div.broker,
      notes: div.notes,
      source: { kind: "div", div },
    });
  }
  for (const entry of cashEntries) {
    if (entry.type !== "deposit" && entry.type !== "withdrawal" && entry.type !== "fx_adjustment") continue;
    rows.push({
      key: `cash:${entry.id}`,
      kind: entry.type,
      date: entry.date,
      createdAt: entry.created_at ?? "",
      ticker: null,
      quantity: null,
      price: null,
      amount: entry.amount,
      currency: entry.currency,
      broker: entry.broker,
      notes: entry.notes,
      source: { kind: "cash", entry },
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

const signedCcy = (v: number, ccy: string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtCcy(Math.abs(v), ccy)}`;

export function StatementTable({
  transactions, dividends, cashEntries, companyByTicker,
  onDeleteTransaction, onDeleteDividend, onDeleteCashEntry,
}: StatementTableProps) {
  const { canEdit } = useAuth();
  const [year, setYear] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);
  const [kinds, setKinds] = useState<Set<StatementKind>>(new Set());
  const [broker, setBroker] = useState<string>(ALL);
  const [currency, setCurrency] = useState<string>(ALL);
  const [pendingDelete, setPendingDelete] = useState<StatementRow | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const allRows = useMemo(() => buildRows(transactions, dividends, cashEntries), [transactions, dividends, cashEntries]);

  const years = useMemo(
    () => [...new Set(allRows.map(r => r.date.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [allRows]
  );
  const brokers = useMemo(() => [...new Set(allRows.map(r => r.broker).filter(Boolean))].sort(), [allRows]);
  const currencies = useMemo(() => [...new Set(allRows.map(r => r.currency).filter(Boolean))].sort(), [allRows]);

  const rows = useMemo(() => allRows.filter(r => {
    if (year !== ALL && r.date.slice(0, 4) !== year) return false;
    if (month !== ALL && r.date.slice(5, 7) !== month) return false;
    if (kinds.size > 0 && !kinds.has(r.kind)) return false;
    if (broker !== ALL && r.broker !== broker) return false;
    if (currency !== ALL && r.currency !== currency) return false;
    return true;
  }), [allRows, year, month, kinds, broker, currency]);

  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number }>();
    for (const r of rows) {
      const t = map.get(r.currency) ?? { inflow: 0, outflow: 0 };
      if (r.amount > 0) t.inflow += r.amount; else t.outflow += r.amount;
      map.set(r.currency, t);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const toggleKind = (k: StatementKind) =>
    setKinds(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  const confirmDelete = async () => {
    const row = pendingDelete;
    setPendingDelete(null);
    if (!row) return;
    setDeletingIds(prev => new Set(prev).add(row.key));
    try {
      if (row.source.kind === "cash") await onDeleteCashEntry(row.source.entry);
      else if (row.source.kind === "tx") await onDeleteTransaction(row.source.tx);
      else await onDeleteDividend(row.source.div);
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(row.key);
        return next;
      });
    }
  };

  const chipClass = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
      active ? "bg-primary/15 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-transparent hover:bg-accent"
    }`;

  const headers = ["Data", "Tipo", "Descrição", "Qtd.", "Preço/ação", "Montante", "Moeda", "Broker", "Notas", ""];

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">Ano: Todos</SelectItem>
              {years.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">Mês: Todos</SelectItem>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1).padStart(2, "0")} className="text-xs">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={broker} onValueChange={setBroker}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Broker" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">Broker: Todos</SelectItem>
              {brokers.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Moeda" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">Moeda: Todas</SelectItem>
              {currencies.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="ml-auto text-[11px] text-muted-foreground">
            {rows.length} movimento{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={chipClass(kinds.size === 0)} onClick={() => setKinds(new Set())}>Todos</button>
          {KIND_ORDER.map(k => (
            <button key={k} className={chipClass(kinds.has(k))} onClick={() => toggleKind(k)}>{KIND_CHIP_LABELS[k]}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 flex flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-foreground">Sem movimentos para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {headers.map((h, i) => (
                  <th key={`${h}-${i}`} className={`px-3 py-2.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap ${
                    i >= 3 && i <= 5 ? "text-right" : "text-left"
                  }`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const company = r.ticker ? companyByTicker.get(r.ticker.toUpperCase()) : undefined;
                const deleting = deletingIds.has(r.key);
                return (
                  <tr key={r.key} className={`border-b border-border/50 hover:bg-accent/20 transition-colors ${deleting ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${KIND_BADGE[r.kind]}`}>
                        {KIND_LABELS[r.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.ticker && (
                        <>
                          <CompanyLinksMenu ticker={r.ticker} company={company}>
                            <button className="text-xs font-medium text-foreground hover:text-primary hover:underline transition-colors text-left">
                              {company?.name || r.ticker}
                            </button>
                          </CompanyLinksMenu>
                          <div className="font-mono text-[10px] text-primary">{r.ticker}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{r.quantity !== null ? fmtQty(r.quantity) : ""}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{r.price !== null ? fmtCcy(r.price, r.currency) : ""}</td>
                    <td className={`px-3 py-2.5 text-right font-mono text-xs font-medium whitespace-nowrap ${
                      r.amount > 0 ? "text-positive" : r.amount < 0 ? "text-negative" : "text-muted-foreground"
                    }`}>
                      {signedCcy(r.amount, r.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.currency}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.broker}</td>
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground max-w-[220px] truncate" title={r.notes ?? undefined}>
                      {r.notes ?? ""}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {canEdit && (
                        deleting ? (
                          <Loader2 className="h-3 w-3 animate-spin mx-auto text-muted-foreground" />
                        ) : (
                          <button
                            onClick={() => setPendingDelete(r)}
                            className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {totalsByCurrency.map(([ccy, t]) => (
                <tr key={ccy} className="border-t border-border bg-secondary/20 text-[11px]">
                  <td colSpan={10} className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1">
                      <span className="font-medium text-foreground">{ccy}</span>
                      <span className="text-muted-foreground">Entradas: <span className="font-mono text-positive">{signedCcy(t.inflow, ccy)}</span></span>
                      <span className="text-muted-foreground">Saídas: <span className="font-mono text-negative">{signedCcy(t.outflow, ccy)}</span></span>
                      <span className="text-muted-foreground">Líquido:{" "}
                        <span className={`font-mono font-semibold ${t.inflow + t.outflow >= 0 ? "text-positive" : "text-negative"}`}>
                          {signedCcy(t.inflow + t.outflow, ccy)}
                        </span>
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={o => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar movimento?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {pendingDelete && (
                  <div className="rounded-md border border-border/60 bg-secondary/30 p-2.5 text-xs space-y-0.5 text-foreground">
                    <div><span className="text-muted-foreground">Data:</span> {pendingDelete.date}</div>
                    <div><span className="text-muted-foreground">Tipo:</span> {KIND_LABELS[pendingDelete.kind]}{pendingDelete.ticker ? ` · ${pendingDelete.ticker}` : ""}</div>
                    <div><span className="text-muted-foreground">Montante:</span> <span className="font-mono">{signedCcy(pendingDelete.amount, pendingDelete.currency)}</span></div>
                    <div><span className="text-muted-foreground">Broker:</span> {pendingDelete.broker}</div>
                  </div>
                )}
                {pendingDelete && (pendingDelete.kind === "deposit" || pendingDelete.kind === "withdrawal") && (
                  <p className="text-xs text-amber-500">Os pesos de cada participante na carteira vão ser recalculados.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
