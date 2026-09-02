import { forwardRef } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PortfolioMember } from "@/lib/portfolioService";
import { fmtEur, fmtEur2, fmtPct, memberColor } from "./shared";

export interface MemberValueBreakdown {
  member: PortfolioMember;
  totalValueEur: number;
  pct: number;
  gainLossEur: number;
}

export interface CashByBrokerRow {
  broker: string;
  eur: number;
  usd: number;
}

export interface TopPositionByValue {
  ticker: string;
  name: string;
  valueEur: number;
  weightPct: number;
}

export interface TopPositionByReturn {
  ticker: string;
  name: string;
  returnEur: number;
  returnPct: number;
}

export interface DividendByCompany {
  ticker: string;
  name: string;
  totalEur: number;
}

interface SummaryCardsProps {
  totalPortfolioEur: number;
  totalDepositedEur: number;
  portfolioGainLossEur: number;
  portfolioGainLossPct: number;
  memberValueBreakdown: MemberValueBreakdown[];

  totalCashEur: number;
  cashByBroker: CashByBrokerRow[];
  eurUsd: number;

  investedCurrentEur: number;
  investedCostEur: number;
  top5ByValue: TopPositionByValue[];

  stockReturnEur: number;
  stockReturnPct: number;
  fxNeutralEur: number;
  fxEffectEur: number;
  top5ByReturn: TopPositionByReturn[];

  totalDividendsEur: number;
  dividendsByCompany: DividendByCompany[];
}

// Radix's TooltipTrigger `asChild` clones this element and merges its own props onto it
// (ref, onPointerEnter/Leave, onFocus/Blur, etc.) so it can detect hover — forwardRef +
// spreading the rest of the props through is required, or the tooltip never gets the events.
const CardShell = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className, ...props }, ref) => (
    <div ref={ref} className={`rounded-xl border border-border bg-card p-4 ${className ?? ""}`} {...props}>
      {children}
    </div>
  )
);
CardShell.displayName = "CardShell";

function CardLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">{children}</p>;
}

export function SummaryCards({
  totalPortfolioEur, totalDepositedEur, portfolioGainLossEur, portfolioGainLossPct, memberValueBreakdown,
  totalCashEur, cashByBroker, eurUsd,
  investedCurrentEur, investedCostEur, top5ByValue,
  stockReturnEur, stockReturnPct, fxNeutralEur, fxEffectEur, top5ByReturn,
  totalDividendsEur, dividendsByCompany,
}: SummaryCardsProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

        {/* 1 — Valor Total Carteira */}
        <Tooltip>
          <TooltipTrigger asChild>
            <CardShell>
              <CardLabel>Valor Total Carteira</CardLabel>
              <p className="font-mono text-lg font-bold text-foreground">{fmtEur(totalPortfolioEur)}</p>
              <div className="mt-2.5 pt-2.5 border-t border-border/50 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">Depositado</span>
                  <span className="font-mono text-[11px] font-medium text-foreground">{fmtEur(totalDepositedEur)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">Mais-valia</span>
                  <span className={`font-mono text-[11px] font-medium ${portfolioGainLossEur >= 0 ? "text-positive" : "text-negative"}`}>
                    {portfolioGainLossEur >= 0 ? "+" : ""}{fmtEur(portfolioGainLossEur)}
                    <span className="text-[10px] ml-1 opacity-75">({fmtPct(portfolioGainLossPct)})</span>
                  </span>
                </div>
              </div>
            </CardShell>
          </TooltipTrigger>
          {memberValueBreakdown.length > 0 && (
            <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
              <p className="text-[10px] text-muted-foreground mb-1.5">Por investidor</p>
              <div className="space-y-1">
                {memberValueBreakdown.map(m => {
                  const { dot } = memberColor(m.member.name);
                  return (
                    <div key={m.member.id} className="flex items-center gap-2 text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                      <span className="w-16 shrink-0">{m.member.name}</span>
                      <span className="font-mono font-medium">{fmtEur(m.totalValueEur)}</span>
                      <span className="font-mono text-muted-foreground">{m.pct.toFixed(1)}%</span>
                      <span className={`font-mono ml-auto ${m.gainLossEur >= 0 ? "text-positive" : "text-negative"}`}>
                        {m.gainLossEur >= 0 ? "+" : ""}{fmtEur(m.gainLossEur)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </TooltipContent>
          )}
        </Tooltip>

        {/* 2 — Liquidez */}
        <Tooltip>
          <TooltipTrigger asChild>
            <CardShell>
              <CardLabel>Liquidez</CardLabel>
              <p className="font-mono text-lg font-bold text-foreground">{fmtEur(totalCashEur)}</p>
              <p className="mt-2.5 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground">
                {cashByBroker.length} broker{cashByBroker.length !== 1 ? "s" : ""}
              </p>
            </CardShell>
          </TooltipTrigger>
          {cashByBroker.length > 0 && (
            <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
              <p className="text-[10px] text-muted-foreground mb-1.5">Por broker</p>
              <div className="space-y-1.5">
                {cashByBroker.map(b => (
                  <div key={b.broker} className="text-[11px]">
                    <div className="flex items-center justify-between font-medium">
                      <span>{b.broker}</span>
                      <span className="font-mono">{fmtEur(b.eur + b.usd / eurUsd)}</span>
                    </div>
                    {(b.eur !== 0 || b.usd === 0) && (
                      <div className="flex items-center justify-between text-muted-foreground pl-2">
                        <span>EUR</span><span className="font-mono">{fmtEur2(b.eur)}</span>
                      </div>
                    )}
                    {b.usd !== 0 && (
                      <div className="flex items-center justify-between text-muted-foreground pl-2">
                        <span>USD</span><span className="font-mono">${b.usd.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TooltipContent>
          )}
        </Tooltip>

        {/* 3 — Valor Investido */}
        <Tooltip>
          <TooltipTrigger asChild>
            <CardShell>
              <CardLabel>Valor Investido</CardLabel>
              <p className="font-mono text-lg font-bold text-foreground">{fmtEur(investedCurrentEur)}</p>
              <div className="mt-2.5 pt-2.5 border-t border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">Custo</span>
                  <span className="font-mono text-[11px] font-medium text-foreground">{fmtEur(investedCostEur)}</span>
                </div>
              </div>
            </CardShell>
          </TooltipTrigger>
          {top5ByValue.length > 0 && (
            <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
              <p className="text-[10px] text-muted-foreground mb-1.5">Top 5 posições por valor</p>
              <div className="space-y-1">
                {top5ByValue.map(p => (
                  <div key={p.ticker} className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 shrink-0 truncate">{p.name}</span>
                    <span className="font-mono font-medium">{fmtEur(p.valueEur)}</span>
                    <span className="font-mono text-muted-foreground ml-auto">{p.weightPct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          )}
        </Tooltip>

        {/* 4 — Rent. Ações */}
        <Tooltip>
          <TooltipTrigger asChild>
            <CardShell>
              <CardLabel>Rent. Ações</CardLabel>
              <p className={`font-mono text-lg font-bold ${stockReturnEur >= 0 ? "text-positive" : "text-negative"}`}>
                {stockReturnEur >= 0 ? "+" : ""}{fmtEur(stockReturnEur)}
              </p>
              <p className={`font-mono text-sm mt-0.5 ${stockReturnPct >= 0 ? "text-positive/80" : "text-negative/80"}`}>
                {fmtPct(stockReturnPct)}
              </p>
              <div className="mt-2.5 pt-2.5 border-t border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">Efeito câmbio</span>
                  <span className={`font-mono text-[11px] font-medium ${fxEffectEur >= 0 ? "text-positive" : "text-negative"}`}>
                    {fxEffectEur >= 0 ? "+" : ""}{fmtEur(fxEffectEur)}
                  </span>
                </div>
              </div>
            </CardShell>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] gap-4">
                <span className="text-muted-foreground">Sem efeito câmbio</span>
                <span className={`font-mono font-medium ${fxNeutralEur >= 0 ? "text-positive" : "text-negative"}`}>
                  {fxNeutralEur >= 0 ? "+" : ""}{fmtEur(fxNeutralEur)}
                </span>
              </div>
              {top5ByReturn.length > 0 && (
                <div className="pt-1.5 border-t border-border/40">
                  <p className="text-[10px] text-muted-foreground mb-1">Top 5 posições por rentabilidade</p>
                  <div className="space-y-1">
                    {top5ByReturn.map(p => (
                      <div key={p.ticker} className="flex items-center gap-2 text-[11px]">
                        <span className="w-24 shrink-0 truncate">{p.name}</span>
                        <span className={`font-mono font-medium ${p.returnEur >= 0 ? "text-positive" : "text-negative"}`}>
                          {p.returnEur >= 0 ? "+" : ""}{fmtEur(p.returnEur)}
                        </span>
                        <span className={`font-mono ml-auto ${p.returnPct >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                          {fmtPct(p.returnPct)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* 5 — Dividendos */}
        <Tooltip>
          <TooltipTrigger asChild>
            <CardShell>
              <CardLabel>Dividendos</CardLabel>
              <p className="font-mono text-lg font-bold text-positive">+{fmtEur(totalDividendsEur)}</p>
              <p className="mt-2.5 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground">
                {dividendsByCompany.length} empresa{dividendsByCompany.length !== 1 ? "s" : ""}
              </p>
            </CardShell>
          </TooltipTrigger>
          {dividendsByCompany.length > 0 && (
            <TooltipContent side="bottom" align="start" className="p-3" sideOffset={4}>
              <p className="text-[10px] text-muted-foreground mb-1.5">Por empresa</p>
              <div className="space-y-1">
                {dividendsByCompany.map(d => (
                  <div key={d.ticker} className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 shrink-0 truncate">{d.name}</span>
                    <span className="font-mono font-medium text-positive ml-auto">+{fmtEur(d.totalEur)}</span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
