import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  PortfolioMember, PortfolioCash, PortfolioCashMember,
  addTransaction, addDividend, addCashEntryWithMembers,
} from "@/lib/portfolioService";
import { getMemberCashProportions, getMemberTickerProportions } from "@/lib/portfolioAnalytics";
import { DBCompany } from "@/lib/financialDataService";
import { fmtCcy } from "./shared";

// Ported (unchanged behavior) from the old Portfolio.tsx "Registar transação" / "Registar liquidez" dialogs.

export const BROKERS = ["IBKR", "Degiro", "Outras"] as const;

function getEffectiveBroker(broker: string, custom: string): string {
  return broker === "Outras" ? (custom.trim() || "Outras") : broker;
}

// ── Add Transaction Dialog ────────────────────────────────────────────────────

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

interface AddTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: DBCompany[];
  members: PortfolioMember[];
  cashEntries: PortfolioCash[];
  cashMemberEntries: PortfolioCashMember[];
  onSaved: () => Promise<void> | void;
}

export function AddTransactionDialog({
  open, onOpenChange, companies, members, cashEntries, cashMemberEntries, onSaved,
}: AddTransactionDialogProps) {
  const { toast } = useToast();
  const [addType, setAddType] = useState<AddType>("buy");
  const [form, setForm] = useState<AddForm>(EMPTY_ADD_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAddType("buy");
      setForm(EMPTY_ADD_FORM);
    }
  }, [open]);

  const totalPreview =
    form.price && form.quantity
      ? parseFloat(form.price || "0") * parseFloat(form.quantity || "0")
      : null;

  const handleAddSubmit = async () => {
    const ticker = form.ticker.trim().toUpperCase();
    const effectiveBroker = getEffectiveBroker(form.broker, form.brokerCustom);
    if (!ticker || !form.date || !form.price || !form.quantity) {
      toast({ title: "Campos obrigatórios", description: "Ticker, data, preço e quantidade são obrigatórios.", variant: "destructive" });
      return;
    }
    if (!effectiveBroker || (form.broker === "Outras" && !form.brokerCustom.trim())) {
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
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              list="portfolio-v2-ticker-list"
              value={form.ticker}
              onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))}
            />
            <datalist id="portfolio-v2-ticker-list">
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
            onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" className="text-xs h-8"
            onClick={handleAddSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Cash Dialog ────────────────────────────────────────────────────────────

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

interface AddCashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: PortfolioMember[];
  onSaved: () => Promise<void> | void;
}

export function AddCashDialog({ open, onOpenChange, members, onSaved }: AddCashDialogProps) {
  const { toast } = useToast();
  const [cashForm, setCashForm] = useState<CashForm>(EMPTY_CASH_FORM);
  const [submittingCash, setSubmittingCash] = useState(false);

  useEffect(() => {
    if (open) setCashForm(EMPTY_CASH_FORM);
  }, [open]);

  const cashFormMembers: PortfolioMember[] = members.length > 0 ? members : [
    { id: "_vjf", name: "V&J",     created_at: "" },
    { id: "_din", name: "Dinis",   created_at: "" },
    { id: "_mar", name: "Mariana", created_at: "" },
  ];

  const cashFormTotal = parseFloat(cashForm.amount || "0") || 0;
  const cashMemberTotal = cashFormMembers.reduce(
    (s, m) => s + (parseFloat(cashForm.memberAmounts[m.id] || "0") || 0), 0
  );
  const cashMemberRemaining = cashFormTotal - cashMemberTotal;

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
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSubmittingCash(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" className="text-xs h-8"
            onClick={handleAddCashSubmit} disabled={submittingCash}>
            {submittingCash && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
