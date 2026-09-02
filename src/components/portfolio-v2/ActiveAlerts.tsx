import { ArrowUp, ArrowDown } from "lucide-react";
import { fmtCcy } from "./shared";

export interface AlertRow {
  id: string;
  ticker: string;
  name: string;
  alertType: "above" | "below";
  targetPrice: number;
  currentPrice: number | null;
  currency: string;
}

interface ActiveAlertsProps {
  alerts: AlertRow[];
}

export function ActiveAlerts({ alerts }: ActiveAlertsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Alertas Ativos</p>
      {alerts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem alertas ativos.</p>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              {a.alertType === "above"
                ? <ArrowUp className="h-3 w-3 text-positive shrink-0" />
                : <ArrowDown className="h-3 w-3 text-negative shrink-0" />}
              <span className="flex-1 min-w-0 truncate text-foreground">{a.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {a.alertType === "above" ? "≥" : "≤"} {fmtCcy(a.targetPrice, a.currency)}
              </span>
              <span className="font-mono text-[11px] text-foreground shrink-0 w-16 text-right">
                {a.currentPrice !== null ? fmtCcy(a.currentPrice, a.currency) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
