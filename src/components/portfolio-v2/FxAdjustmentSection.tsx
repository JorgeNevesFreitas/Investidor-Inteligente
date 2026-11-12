import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortfolioMember } from "@/lib/portfolioService";
import { FxAdjustmentMode, FX_ADJUSTMENT_MODE_LABELS, FxMemberSplit } from "@/lib/fxAdjustment";
import { fmtCcy, fmtEur2 } from "./shared";

// "Ajuste cambial" fields of the "Registar liquidez" dialog. Fully controlled by AddCashDialog,
// which owns the state and computes the adjustment/splits (see src/lib/fxAdjustment.ts).

const fmtSignedCcy = (v: number, ccy: "EUR" | "USD") =>
  `${v >= 0 ? "+" : "−"}${ccy === "EUR" ? fmtEur2(Math.abs(v)) : fmtCcy(Math.abs(v), ccy)}`;

const fmtPlainCcy = (v: number, ccy: "EUR" | "USD") => (ccy === "EUR" ? fmtEur2(v) : fmtCcy(v, ccy));

interface FxAdjustmentSectionProps {
  mode: FxAdjustmentMode;
  onModeChange: (mode: FxAdjustmentMode) => void;
  value: string;
  onValueChange: (value: string) => void;
  /** Selected currency (only editable in "cash_balance" and "direct" modes). */
  currency: "EUR" | "USD";
  onCurrencyChange: (ccy: "EUR" | "USD") => void;
  /** Effective currency of the adjustment (EUR forced in modes 1/2). */
  effectiveCurrency: "EUR" | "USD";
  broker: string;
  totalPortfolioEur: number;
  fxAdjustmentsEur: number;
  appCashBalance: number;
  adjustment: number;
  members: PortfolioMember[];
  splits: FxMemberSplit[];
}

export function FxAdjustmentSection({
  mode, onModeChange, value, onValueChange, currency, onCurrencyChange, effectiveCurrency,
  broker, totalPortfolioEur, fxAdjustmentsEur, appCashBalance, adjustment, members, splits,
}: FxAdjustmentSectionProps) {
  const hasCurrencySelect = mode === "cash_balance" || mode === "direct";
  const valid = Number.isFinite(adjustment);
  const memberName = new Map(members.map(m => [m.id, m.name]));

  return (
    <div className="space-y-3.5">
      <div>
        <label className="text-xs text-muted-foreground">Calcular a partir de</label>
        <Select value={mode} onValueChange={v => onModeChange(v as FxAdjustmentMode)}>
          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(FX_ADJUSTMENT_MODE_LABELS) as FxAdjustmentMode[]).map(m => (
              <SelectItem key={m} value={m} className="text-xs">{FX_ADJUSTMENT_MODE_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasCurrencySelect && (
        <div>
          <label className="text-xs text-muted-foreground">Moeda</label>
          <Select value={currency} onValueChange={v => onCurrencyChange(v as "EUR" | "USD")}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR" className="text-xs">EUR</SelectItem>
              <SelectItem value="USD" className="text-xs">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === "portfolio_total" && (
        <p className="text-[11px] text-muted-foreground">
          Valor total na app: <span className="font-mono font-medium text-foreground">{fmtEur2(totalPortfolioEur)}</span>
        </p>
      )}
      {mode === "fx_effect" && (
        <p className="text-[11px] text-muted-foreground">
          Efeito câmbio atual na app: <span className="font-mono font-medium text-foreground">{fmtEur2(fxAdjustmentsEur)}</span>
        </p>
      )}
      {mode === "cash_balance" && (
        <p className="text-[11px] text-muted-foreground">
          Saldo na app ({broker || "—"}, {currency}):{" "}
          <span className="font-mono font-medium text-foreground">{fmtPlainCcy(appCashBalance, currency)}</span>
        </p>
      )}

      <div>
        <label className="text-xs text-muted-foreground">
          {mode === "portfolio_total" ? "Valor total no broker (€)"
            : mode === "fx_effect" ? "Efeito câmbio no broker (€)"
            : mode === "cash_balance" ? "Saldo real no broker"
            : "Valor do ajuste"}
        </label>
        <Input type="number" step="0.01" className="mt-1 h-8 text-xs font-mono"
          placeholder="0.00" value={value}
          onChange={e => onValueChange(e.target.value)} />
        {mode === "portfolio_total" && (
          <p className="mt-1 text-[10px] text-muted-foreground">Se usas vários brokers, indica a soma de todos.</p>
        )}
        {mode === "direct" && (
          <p className="mt-1 text-[10px] text-muted-foreground">Aceita valores positivos e negativos.</p>
        )}
      </div>

      <div className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2.5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Ajuste a registar:</span>
        <span className={`font-mono text-sm font-semibold ${
          !valid ? "text-muted-foreground" : adjustment >= 0 ? "text-positive" : "text-negative"
        }`}>
          {valid ? fmtSignedCcy(adjustment, effectiveCurrency) : "—"}
        </span>
      </div>

      {splits.length > 0 && (
        <div className="rounded-md border border-border/60 bg-secondary/20 p-2.5">
          <p className="text-xs font-medium text-foreground mb-1.5">Repartição automática por participante</p>
          <div className="space-y-1">
            {splits.map(s => (
              <div key={s.member_id} className="flex items-center gap-2 text-[11px]">
                <span className="text-foreground w-16 shrink-0">{memberName.get(s.member_id) ?? s.member_id}</span>
                <span className={`font-mono ml-auto ${s.amount >= 0 ? "text-positive" : "text-negative"}`}>
                  {valid ? fmtSignedCcy(s.amount, effectiveCurrency) : "—"}
                </span>
                <span className="font-mono w-12 text-right text-muted-foreground">{s.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Segundo o peso de cada participante nos depósitos.</p>
        </div>
      )}
    </div>
  );
}
