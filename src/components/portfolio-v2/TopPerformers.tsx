import { RankedPosition } from "@/lib/portfolioAnalytics";
import { fmtEur, fmtPct } from "./shared";

interface TopPerformersProps {
  best: RankedPosition[];
  worst: RankedPosition[];
}

function PerformerRow({ p }: { p: RankedPosition }) {
  const pos = p.returnPct >= 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex-1 min-w-0 truncate text-foreground">{p.name}</span>
      <span className={`font-mono font-medium ${pos ? "text-positive" : "text-negative"}`}>{fmtPct(p.returnPct)}</span>
      <span className={`font-mono text-[10px] w-16 text-right shrink-0 ${pos ? "text-positive/70" : "text-negative/70"}`}>
        {p.returnEur >= 0 ? "+" : ""}{fmtEur(p.returnEur)}
      </span>
    </div>
  );
}

export function TopPerformers({ best, worst }: TopPerformersProps) {
  if (best.length === 0 && worst.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Top Performers</p>
        <p className="text-xs text-muted-foreground">Sem posições elegíveis para ranking.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Top Performers</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] text-positive font-medium mb-1.5">Melhores</p>
          <div className="space-y-1.5">
            {best.length === 0
              ? <p className="text-[11px] text-muted-foreground">—</p>
              : best.map(p => <PerformerRow key={p.ticker} p={p} />)}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-negative font-medium mb-1.5">Piores</p>
          <div className="space-y-1.5">
            {worst.length === 0
              ? <p className="text-[11px] text-muted-foreground">—</p>
              : worst.map(p => <PerformerRow key={p.ticker} p={p} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
