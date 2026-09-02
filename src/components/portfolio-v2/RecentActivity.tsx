import { fmtCcy, fmtQty } from "./shared";

export interface ActivityItem {
  id: string;
  date: string;
  type: "buy" | "sell" | "dividend";
  ticker: string;
  name: string;
  quantity: number;
  amount: number; // total value (price/amount per share × quantity), in its own currency
  currency: string;
}

const TYPE_LABEL: Record<ActivityItem["type"], string> = { buy: "Compra", sell: "Venda", dividend: "Dividendo" };
const TYPE_CLASS: Record<ActivityItem["type"], string> = {
  buy: "bg-positive/15 text-positive",
  sell: "bg-negative/15 text-negative",
  dividend: "bg-primary/15 text-primary",
};

interface RecentActivityProps {
  items: ActivityItem[];
}

export function RecentActivity({ items }: RecentActivityProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Atividade Recente</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem atividade registada.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 text-xs">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${TYPE_CLASS[item.type]}`}>
                {TYPE_LABEL[item.type]}
              </span>
              <span className="flex-1 min-w-0 truncate text-foreground">{item.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">{fmtQty(item.quantity)}x</span>
              <span className="font-mono text-[11px] text-foreground shrink-0 w-20 text-right">{fmtCcy(item.amount, item.currency)}</span>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-16 text-right">{item.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
