import { useMemo, useState, Fragment } from "react";
import { ChevronDown, ChevronRight, StickyNote, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import {
  Position, PortfolioMember, PortfolioCash, PortfolioCashMember,
  PortfolioTransaction, PortfolioDividend,
} from "@/lib/portfolioService";
import { getMemberTickerProportions } from "@/lib/portfolioAnalytics";
import { DBCompany } from "@/lib/financialDataService";
import { CompanyLinksMenu } from "./CompanyLinksMenu";
import { fmtEur, fmtCcy, fmtQty, memberColor, ReturnCell } from "./shared";

interface PositionsTableProps {
  positions: Position[];
  members: PortfolioMember[];
  cashEntries: PortfolioCash[];
  cashMemberEntries: PortfolioCashMember[];
  companyByTicker: Map<string, DBCompany>;
  companyNotesMap: Map<string, string>;
  allTransactions: PortfolioTransaction[];
  allDividends: PortfolioDividend[];
  onDeleteTransaction: (tx: PortfolioTransaction) => void;
  onDeleteDividend: (div: PortfolioDividend) => void;
}

export function PositionsTable({
  positions, members, cashEntries, cashMemberEntries,
  companyByTicker, companyNotesMap, allTransactions, allDividends,
  onDeleteTransaction, onDeleteDividend,
}: PositionsTableProps) {
  const [activeTab, setActiveTab] = useState<string>("abertas");
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const toggleExpand = (ticker: string) =>
    setExpandedTickers(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
      return next;
    });

  const activeMemberProportions = useMemo(() => {
    const member = members.find(m => m.name === activeTab);
    if (!member) return null;
    const map = new Map<string, number>();
    for (const pos of positions) {
      const props = getMemberTickerProportions(cashEntries, cashMemberEntries, members, pos.ticker);
      map.set(pos.ticker, props.find(p => p.memberId === member.id)?.proportion ?? 0);
    }
    return map;
  }, [activeTab, positions, members, cashEntries, cashMemberEntries]);

  const filteredPositions = useMemo(() => {
    if (activeTab === "encerradas") return positions.filter(p => p.current_qty === 0);
    if (activeTab === "abertas") return positions.filter(p => p.current_qty > 0);
    const member = members.find(m => m.name === activeTab);
    if (!member) return positions.filter(p => p.current_qty > 0);
    return positions.filter(p => {
      if (p.current_qty === 0) return false;
      const props = getMemberTickerProportions(cashEntries, cashMemberEntries, members, p.ticker);
      return (props.find(pr => pr.memberId === member.id)?.proportion ?? 0) > 0.001;
    });
  }, [activeTab, positions, members, cashEntries, cashMemberEntries]);

  const totalOpenValueEur = useMemo(
    () => positions.filter(p => p.current_qty > 0).reduce((s, p) => s + p.current_value_eur, 0),
    [positions]
  );

  const historyRows = useMemo(
    () => [...allTransactions].sort((a, b) => b.date.localeCompare(a.date)),
    [allTransactions]
  );

  const dividendRows = useMemo(
    () => [...allDividends].sort((a, b) => b.date.localeCompare(a.date)),
    [allDividends]
  );

  const tabs = [
    { id: "abertas", label: "Posições abertas" },
    ...members.map(m => ({ id: m.name, label: m.name })),
    { id: "encerradas", label: "Encerradas" },
    { id: "historico", label: "Histórico" },
    { id: "dividendos", label: "Dividendos" },
  ];

  const isPositionsTab = activeTab !== "historico" && activeTab !== "dividendos";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-0.5 bg-secondary/40 rounded-lg p-1 flex-wrap">
          {tabs.map(tab => {
            const isMember = members.some(m => m.name === tab.id);
            const { dot } = isMember ? memberColor(tab.id) : { dot: "" };
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isMember && <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} />}
                {tab.label}
              </button>
            );
          })}
        </div>
        {isPositionsTab && (
          <p className="text-[11px] text-muted-foreground">
            {filteredPositions.length} posição{filteredPositions.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {activeTab === "historico" ? (
        <HistoryTable rows={historyRows} companyByTicker={companyByTicker} onDelete={onDeleteTransaction} />
      ) : activeTab === "dividendos" ? (
        <DividendsTable rows={dividendRows} companyByTicker={companyByTicker} onDelete={onDeleteDividend} />
      ) : filteredPositions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 flex flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-foreground">
            {activeTab === "encerradas" ? "Sem posições encerradas" : "Sem posições"}
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
                <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Valor (€)</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Rent. Ações</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Dividendos</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Rent. Total</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">Peso</th>
              </tr>
            </thead>
            <tbody>
              {filteredPositions.map(pos => {
                const expanded = expandedTickers.has(pos.ticker);
                const closed = pos.current_qty === 0;
                const memberProp = activeMemberProportions?.get(pos.ticker) ?? 1;
                const displayQty = pos.current_qty * memberProp;
                const displayValueEur = pos.current_value_eur * memberProp;
                const displayStockReturnEur = pos.stock_return_eur * memberProp;
                const displayDivReturnEur = pos.dividend_return_eur * memberProp;
                const displayTotalReturnEur = pos.total_return_eur * memberProp;
                const weightPct = totalOpenValueEur > 0 ? (pos.current_value_eur / totalOpenValueEur) * 100 : 0;
                const company = companyByTicker.get(pos.ticker.toUpperCase());
                const note = companyNotesMap.get(pos.ticker.toUpperCase());

                return (
                  <Fragment key={pos.ticker}>
                    <tr
                      className={`border-b border-border/50 hover:bg-accent/20 cursor-pointer transition-colors ${closed ? "opacity-60" : ""}`}
                      onClick={() => toggleExpand(pos.ticker)}
                    >
                      <td className="px-2 py-2.5 text-center text-muted-foreground">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5 mx-auto" /> : <ChevronRight className="h-3.5 w-3.5 mx-auto" />}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {note && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <StickyNote className="h-3.5 w-3.5 text-neutral-warn shrink-0 cursor-default" onClick={e => e.stopPropagation()} />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs whitespace-pre-wrap text-xs">
                                {note.slice(0, 240)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <CompanyLinksMenu ticker={pos.ticker} company={company}>
                            <button className="text-xs font-medium text-foreground leading-tight hover:text-primary hover:underline transition-colors text-left">
                              {pos.company_name || pos.ticker}
                            </button>
                          </CompanyLinksMenu>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[11px] text-primary">{pos.ticker}</span>
                          {closed && <span className="rounded px-1 text-[9px] bg-secondary text-muted-foreground">Encerrada</span>}
                          {pos.is_gift && <span className="rounded px-1 text-[9px] bg-purple-500/15 text-purple-500">Oferta</span>}
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
                        {pos.current_price !== null ? fmtCcy(pos.current_price, pos.currency) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {displayQty > 0 ? fmtEur(displayValueEur) : <span className="text-muted-foreground">—</span>}
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
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {closed ? "—" : `${weightPct.toFixed(1)}%`}
                      </td>
                    </tr>

                    {expanded && (
                      <tr className="border-b border-border/30 bg-secondary/10">
                        <td colSpan={11} className="px-5 py-3">
                          <PositionDrilldown position={pos} onDeleteTransaction={onDeleteTransaction} onDeleteDividend={onDeleteDividend} />
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
  );
}

interface PositionDrilldownProps {
  position: Position;
  onDeleteTransaction: (tx: PortfolioTransaction) => void;
  onDeleteDividend: (div: PortfolioDividend) => void;
}

function PositionDrilldown({ position, onDeleteTransaction, onDeleteDividend }: PositionDrilldownProps) {
  const { canEdit } = useAuth();
  return (
    <div className="space-y-4">
      {position.transactions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Transações</p>
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
                {position.transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-border/30 hover:bg-secondary/20 last:border-0">
                    <td className="px-2.5 py-1.5 font-mono text-[11px]">{tx.date}</td>
                    <td className="px-2.5 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tx.type === "buy" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"}`}>
                        {tx.type === "buy" ? "Compra" : "Venda"}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 font-mono text-[11px] text-right">{fmtCcy(tx.price_per_share, tx.currency)}</td>
                    <td className="px-2.5 py-1.5 font-mono text-[11px] text-right">{fmtQty(tx.quantity)}</td>
                    <td className="px-2.5 py-1.5 font-mono text-[11px] text-right">{fmtCcy(tx.price_per_share * tx.quantity, tx.currency)}</td>
                    <td className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{tx.currency}</td>
                    <td className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{tx.broker}</td>
                    <td className="px-2.5 py-1.5 text-center">
                      {canEdit && (
                        <button
                          onClick={() => onDeleteTransaction(tx)}
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {position.dividends.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Dividendos</p>
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
                {position.dividends.map(div => (
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
                      {canEdit && (
                        <button
                          onClick={() => onDeleteDividend(div)}
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {position.transactions.length === 0 && position.dividends.length === 0 && (
        <p className="text-xs text-muted-foreground">Sem histórico.</p>
      )}
    </div>
  );
}

interface HistoryTableProps {
  rows: PortfolioTransaction[];
  companyByTicker: Map<string, DBCompany>;
  onDelete: (tx: PortfolioTransaction) => void;
}

function HistoryTable({ rows, companyByTicker, onDelete }: HistoryTableProps) {
  const { canEdit } = useAuth();
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 flex flex-col items-center justify-center text-center">
        <p className="text-sm font-medium text-foreground">Sem transações</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            {["Data", "Empresa", "Tipo", "Preço/ação", "Qtd.", "Total", "Moeda", "Broker", ""].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(tx => {
            const company = companyByTicker.get(tx.ticker.toUpperCase());
            return (
              <tr key={tx.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                <td className="px-3 py-2.5 font-mono text-xs">{tx.date}</td>
                <td className="px-3 py-2.5">
                  <CompanyLinksMenu ticker={tx.ticker} company={company}>
                    <button className="text-xs font-medium text-foreground hover:text-primary hover:underline transition-colors">
                      {company?.name || tx.ticker}
                    </button>
                  </CompanyLinksMenu>
                  <div className="font-mono text-[10px] text-primary">{tx.ticker}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tx.type === "buy" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"}`}>
                    {tx.type === "buy" ? "Compra" : "Venda"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtCcy(tx.price_per_share, tx.currency)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtQty(tx.quantity)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtCcy(tx.price_per_share * tx.quantity, tx.currency)}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{tx.currency}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{tx.broker}</td>
                <td className="px-3 py-2.5 text-center">
                  {canEdit && (
                    <button
                      onClick={() => onDelete(tx)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DividendsTableProps {
  rows: PortfolioDividend[];
  companyByTicker: Map<string, DBCompany>;
  onDelete: (div: PortfolioDividend) => void;
}

function DividendsTable({ rows, companyByTicker, onDelete }: DividendsTableProps) {
  const { canEdit } = useAuth();
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 flex flex-col items-center justify-center text-center">
        <p className="text-sm font-medium text-foreground">Sem dividendos</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            {["Data", "Empresa", "Valor/ação", "Qtd.", "Total recebido", "Moeda", "Broker", ""].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(div => {
            const company = companyByTicker.get(div.ticker.toUpperCase());
            return (
              <tr key={div.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                <td className="px-3 py-2.5 font-mono text-xs">{div.date}</td>
                <td className="px-3 py-2.5">
                  <CompanyLinksMenu ticker={div.ticker} company={company}>
                    <button className="text-xs font-medium text-foreground hover:text-primary hover:underline transition-colors">
                      {company?.name || div.ticker}
                    </button>
                  </CompanyLinksMenu>
                  <div className="font-mono text-[10px] text-primary">{div.ticker}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtCcy(div.amount_per_share, div.currency)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtQty(div.quantity)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-positive font-medium">
                  +{fmtCcy(div.amount_per_share * div.quantity, div.currency)}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{div.currency}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{div.broker}</td>
                <td className="px-3 py-2.5 text-center">
                  {canEdit && (
                    <button
                      onClick={() => onDelete(div)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
