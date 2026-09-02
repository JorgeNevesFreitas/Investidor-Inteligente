import { PortfolioMember } from "@/lib/portfolioService";
import { fmtEur, fmtPct, memberColor, MemberAvatar } from "./shared";

export interface MemberPanelData {
  member: PortfolioMember;
  weightPct: number;
  depositedEur: number;
  totalValueEur: number;
  investedEur: number;
  cashEur: number;
  stockReturnEur: number;
  stockReturnPct: number;
  dividendReturnEur: number;
  totalReturnEur: number;
  totalPct: number;
}

interface InvestorPanelProps {
  members: MemberPanelData[];
}

export function InvestorPanel({ members }: InvestorPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Por Investidor</p>
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados de participantes.</p>
      ) : (
        <div className="space-y-3">
          {members.map(ms => {
            const { bar } = memberColor(ms.member.name);
            return (
              <div key={ms.member.id} className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MemberAvatar name={ms.member.name} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{ms.member.name}</p>
                      <p className="text-[10px] text-muted-foreground">{ms.weightPct.toFixed(1)}% da carteira</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold text-foreground">{fmtEur(ms.totalValueEur)}</p>
                    <p className={`font-mono text-xs ${ms.totalReturnEur >= 0 ? "text-positive" : "text-negative"}`}>
                      {ms.totalReturnEur >= 0 ? "+" : ""}{fmtEur(ms.totalReturnEur)}
                    </p>
                    <p className={`font-mono text-[10px] ${ms.totalPct >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                      {fmtPct(ms.totalPct)}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 w-full bg-secondary/60 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${bar}`} style={{ width: `${Math.min(100, ms.weightPct)}%` }} />
                </div>

                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-2 pt-2 border-t border-border/40">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Depositado</p>
                    <p className="font-mono text-xs font-medium text-foreground">
                      {fmtEur(ms.depositedEur)} <span className="text-muted-foreground">({ms.weightPct.toFixed(1)}%)</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Investido</p>
                    <p className="font-mono text-xs font-medium text-foreground">{fmtEur(ms.investedEur)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Liquidez</p>
                    <p className="font-mono text-xs font-medium text-foreground">{fmtEur(ms.cashEur)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Rent. Ações</p>
                    <p className={`font-mono text-xs font-medium ${ms.stockReturnEur >= 0 ? "text-positive" : "text-negative"}`}>
                      {ms.stockReturnEur >= 0 ? "+" : ""}{fmtEur(ms.stockReturnEur)}
                    </p>
                    <p className={`font-mono text-[10px] ${ms.stockReturnPct >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                      {fmtPct(ms.stockReturnPct)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Dividendos</p>
                    <p className="font-mono text-xs font-medium text-positive">
                      +{fmtEur(ms.dividendReturnEur)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
