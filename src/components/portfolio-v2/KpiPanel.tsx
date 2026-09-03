import { SectorAllocation } from "@/lib/portfolioAnalytics";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtEur, fmtPct2 } from "./shared";

interface KpiPanelProps {
  mwr: number | null;
  twr: number | null;
  volatility: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  beta: number | null;
  snapshotCount: number;
  sectorAllocation: SectorAllocation[];
}

function KpiTile({ label, value, hint, tone, tooltip }: { label: string; value: string | null; hint?: string; tone?: "positive" | "negative" | "neutral"; tooltip?: string }) {
  const colorClass = value === null
    ? "text-muted-foreground text-xs"
    : tone === "positive" ? "text-positive"
    : tone === "negative" ? "text-negative"
    : "text-foreground";
  const tile = (
    <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 cursor-default">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-mono text-sm font-bold ${colorClass}`}>
        {value ?? "Dados insuficientes"}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
  if (!tooltip) return tile;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{tile}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] p-3">
        <p className="text-[11px] leading-snug">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const KPI_TOOLTIPS = {
  mwr: "Money-Weighted Return: mede a rentabilidade real da carteira tendo em conta o timing e o valor de cada depósito e levantamento. Representa a taxa de retorno anualizada do capital investido.",
  twr: "Time-Weighted Return: mede a performance da carteira eliminando o efeito dos depósitos e levantamentos. Permite comparar a performance com benchmarks de mercado.",
  volatility: "Desvio padrão anualizado dos retornos diários. Mede o risco da carteira — quanto maior, mais oscila o valor.",
  maxDrawdown: "Maior queda percentual do valor da carteira desde um máximo até um mínimo subsequente. Indica o pior cenário de perda que um investidor teria sofrido.",
  beta: "Mede a sensibilidade da carteira face ao S&P 500. Beta > 1 significa mais volátil que o mercado, Beta < 1 significa mais estável.",
  sharpe: "Mede o retorno ajustado ao risco. Calcula quantas unidades de retorno se obtêm por cada unidade de risco assumido. Acima de 1 é considerado bom.",
} as const;

const SECTOR_COLORS = [
  "bg-blue-500", "bg-teal-500", "bg-purple-500", "bg-amber-500",
  "bg-rose-500", "bg-emerald-500", "bg-indigo-500", "bg-slate-500",
];

export function KpiPanel({ mwr, twr, volatility, maxDrawdown, sharpe, beta, snapshotCount, sectorAllocation }: KpiPanelProps) {
  const tonePct = (v: number | null): "positive" | "negative" | undefined =>
    v === null ? undefined : v >= 0 ? "positive" : "negative";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">KPIs da Carteira</p>
        {snapshotCount < 2 && (
          <span className="text-[10px] text-muted-foreground">
            A acumular histórico diário{snapshotCount > 0 ? ` (${snapshotCount} dia${snapshotCount !== 1 ? "s" : ""})` : ""}
          </span>
        )}
      </div>

      <TooltipProvider delayDuration={300}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <KpiTile label="MWR (anualizado)" value={mwr !== null ? fmtPct2(mwr * 100) : null} tone={tonePct(mwr)} tooltip={KPI_TOOLTIPS.mwr} />
          <KpiTile label="TWR" value={twr !== null ? fmtPct2(twr * 100) : null} tone={tonePct(twr)} tooltip={KPI_TOOLTIPS.twr} />
          <KpiTile label="Volatilidade" value={volatility !== null ? `${(volatility * 100).toFixed(1)}%` : null} tooltip={KPI_TOOLTIPS.volatility} />
          <KpiTile label="Max Drawdown" value={maxDrawdown !== null ? fmtPct2(maxDrawdown * 100) : null} tone={maxDrawdown !== null ? "negative" : undefined} tooltip={KPI_TOOLTIPS.maxDrawdown} />
          <KpiTile label="Beta (vs. S&P 500)" value={beta !== null ? beta.toFixed(2) : null} tooltip={KPI_TOOLTIPS.beta} />
          <KpiTile label="Sharpe Ratio" value={sharpe !== null ? sharpe.toFixed(2) : null} tooltip={KPI_TOOLTIPS.sharpe} />
        </div>
      </TooltipProvider>

      <div className="mt-4 pt-3 border-t border-border/40">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Alocação por Setor</p>
        {sectorAllocation.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem posições abertas.</p>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="space-y-1.5">
              {sectorAllocation.map((s, i) => (
                <Tooltip key={s.sector}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-default">
                      <span className="text-[11px] text-muted-foreground w-28 shrink-0 truncate">{s.sector}</span>
                      <div className="flex-1 bg-secondary/60 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${SECTOR_COLORS[i % SECTOR_COLORS.length]}`}
                          style={{ width: `${Math.min(100, s.pct)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-foreground w-12 shrink-0 text-right">{s.pct.toFixed(1)}%</span>
                      <span className="font-mono text-[10px] text-muted-foreground w-16 shrink-0 text-right">{fmtEur(s.valueEur)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" className="p-3" sideOffset={4}>
                    <p className="text-[10px] text-muted-foreground mb-1.5">{s.sector}</p>
                    <div className="space-y-1">
                      {s.companies.map(c => (
                        <div key={c.ticker} className="flex items-center gap-2 text-[11px]">
                          <span className="w-28 shrink-0 truncate">{c.name}</span>
                          <span className="font-mono font-medium ml-auto">{fmtEur(c.valueEur)}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
