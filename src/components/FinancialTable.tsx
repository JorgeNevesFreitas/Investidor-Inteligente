import { FinancialYear } from "@/lib/mockData";
import { formatPercent, getChangeColor } from "@/lib/calculations";
import { computeOwnerEarningsSeries, isSignificantDivergence } from "@/lib/calculationsBuffett";

type SectionKey = "performance" | "profitability" | "structure" | "incomeStatement" | "balanceSheet" | "cashFlow";

interface FinancialTableProps {
  data: FinancialYear[];
  section: SectionKey;
}

const fmtNum = (v: number) => v.toLocaleString();
const fmtDec = (v: number) => v.toFixed(2);
const fmtPctOrDash = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : formatPercent(v);

interface Threshold {
  value: number;
  direction: "above" | "below";
  hint: string;
  warn?: number; // enables 3-level coloring: green / yellow / red
}

interface RowDef {
  key: string;
  label: string;
  format: (v: any) => string;
  color?: boolean;
  threshold?: Threshold;
}

const sections: Record<SectionKey, RowDef[]> = {
  performance: [
    { key: "revenue",        label: "Revenue ($M)",          format: fmtNum },
    { key: "revenueGrowth",  label: "Revenue Growth",        format: formatPercent,   color: true },
    { key: "grossProfit",    label: "Gross Profit ($M)",     format: fmtNum },
    { key: "grossMargin",    label: "Gross Margin",          format: formatPercent },
    { key: "operatingIncome",label: "Operating Income ($M)", format: fmtNum },
    { key: "ebitGrowth",     label: "EBIT Growth",           format: formatPercent,   color: true },
    { key: "netIncome",      label: "Net Income ($M)",       format: fmtNum },
    { key: "netIncomeGrowth",label: "Net Income Growth",     format: formatPercent,   color: true },
    { key: "eps",            label: "EPS ($)",               format: fmtDec },
    { key: "epsGrowth",      label: "EPS Growth",            format: formatPercent,   color: true },
    { key: "fcf",            label: "Free Cash Flow ($M)",   format: fmtNum },
    { key: "fcfGrowth",      label: "FCF Growth",            format: formatPercent,   color: true },
  ],
  profitability: [
    { key: "grossMargin",      label: "Gross Margin",         format: formatPercent,   threshold: { value: 40,   direction: "above", hint: "> 40%"  } },
    { key: "roe",              label: "ROE",                  format: formatPercent,   threshold: { value: 7,    direction: "above", hint: "> 7%"   } },
    { key: "netMargin",        label: "Net Margin",           format: formatPercent,   threshold: { value: 15,   direction: "above", hint: "> 15%",  warn: 10  } },
    { key: "operatingMargin",  label: "Operating Margin",     format: formatPercent },
    { key: "sgaToRevenue",     label: "SG&A / Revenue",       format: formatPercent,   threshold: { value: 35,   direction: "below", hint: "< 35%",  warn: 40  } },
    { key: "rdToRevenue",      label: "R&D / Revenue",        format: formatPercent,   threshold: { value: 10,   direction: "below", hint: "< 10%"  } },
    { key: "depreciationToGP", label: "Amortizações / GP",    format: fmtPctOrDash,    threshold: { value: 10,   direction: "below", hint: "< 10%",  warn: 15  } },
    { key: "interestToGP",     label: "Custo Financ. / GP",   format: fmtPctOrDash,    threshold: { value: 10,   direction: "below", hint: "< 10%",  warn: 15  } },
  ],
  structure: [
    { key: "debtToEquity",     label: "Debt / Equity",        format: fmtDec,          threshold: { value: 0.50, direction: "below", hint: "< 0.50" } },
    { key: "currentRatio",     label: "Current Ratio",        format: fmtDec,          threshold: { value: 1.50, direction: "above", hint: "> 1.50", warn: 1.0 } },
    { key: "bookValuePerShare",label: "Book Value / Share ($)",format: fmtDec },
    { key: "bookValueGrowth",  label: "BV Growth",            format: formatPercent,   color: true },
    { key: "sharesOutstanding",label: "Shares Outstanding (M)",format: fmtNum },
    { key: "dividends",        label: "Dividends ($)",        format: fmtDec },
    { key: "payoutRatio",      label: "Payout Ratio",         format: formatPercent },
  ],
  incomeStatement: [
    { key: "revenue",          label: "Revenue ($M)",          format: fmtNum },
    { key: "revenueGrowth",    label: "Revenue Growth",        format: formatPercent,   color: true },
    { key: "grossProfit",      label: "Gross Profit ($M)",     format: fmtNum },
    { key: "grossMargin",      label: "Gross Margin",          format: formatPercent },
    { key: "operatingIncome",  label: "Operating Income ($M)", format: fmtNum },
    { key: "operatingMargin",  label: "Operating Margin",      format: formatPercent },
    { key: "ebitGrowth",       label: "EBIT Growth",           format: formatPercent,   color: true },
    { key: "netIncome",        label: "Net Income ($M)",       format: fmtNum },
    { key: "netIncomeGrowth",  label: "Net Income Growth",     format: formatPercent,   color: true },
    { key: "netMargin",        label: "Net Margin",            format: formatPercent },
    { key: "eps",              label: "EPS ($)",               format: fmtDec },
    { key: "epsGrowth",        label: "EPS Growth",            format: formatPercent,   color: true },
    { key: "sharesOutstanding",label: "Shares Outstanding (M)",format: fmtNum },
    { key: "sgaToRevenue",     label: "SG&A / Revenue",        format: formatPercent },
    { key: "rdToRevenue",      label: "R&D / Revenue",         format: formatPercent },
  ],
  balanceSheet: [
    { key: "bookValuePerShare",label: "Book Value / Share ($)", format: fmtDec },
    { key: "bookValueGrowth",  label: "BV Growth",             format: formatPercent,   color: true },
    { key: "debtToEquity",     label: "Debt / Equity",         format: fmtDec },
    { key: "currentRatio",     label: "Current Ratio",         format: fmtDec },
    { key: "sharesOutstanding",label: "Shares Outstanding (M)", format: fmtNum },
    { key: "roe",              label: "ROE",                   format: formatPercent },
  ],
  cashFlow: [
    { key: "fcf",              label: "Free Cash Flow ($M)",   format: fmtNum },
    { key: "fcfGrowth",        label: "FCF Growth",            format: formatPercent,   color: true },
    { key: "dividends",        label: "Dividends / Share ($)", format: fmtDec },
    { key: "payoutRatio",      label: "Payout Ratio",          format: formatPercent },
  ],
};

export function FinancialTable({ data, section }: FinancialTableProps) {
  const rows = sections[section];
  const sortedData = [...data].sort((a, b) => a.year - b.year);

  const ownerEarningsSeries = (section === "cashFlow" || section === "performance") ? computeOwnerEarningsSeries(sortedData) : [];
  const ownerEarningsByYear = new Map(ownerEarningsSeries.map(o => [o.year, o]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">Métrica</th>
            {sortedData.map(d => (
              <th key={d.year} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">{d.year}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
              <td className="sticky left-0 bg-card px-3 py-2 text-xs font-medium text-foreground whitespace-nowrap">
                {row.label}
                {row.threshold && (
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60">
                    ({row.threshold.hint})
                  </span>
                )}
              </td>
              {sortedData.map(d => {
                const val = (d as any)[row.key];
                let colorClass = "";
                if (row.color) {
                  colorClass = getChangeColor(val);
                } else if (row.threshold && val != null && isFinite(val as number)) {
                  const { value, direction, warn } = row.threshold;
                  const n = val as number;
                  if (warn !== undefined) {
                    if (direction === "above") {
                      colorClass = n >= value ? "text-positive" : n >= warn ? "text-neutral-warn" : "text-negative";
                    } else {
                      colorClass = n < value ? "text-positive" : n < warn ? "text-neutral-warn" : "text-negative";
                    }
                  } else {
                    colorClass = (direction === "above" ? n >= value : n <= value) ? "text-positive" : "text-negative";
                  }
                }
                return (
                  <td key={d.year} className={`px-3 py-2 text-right font-mono text-xs ${colorClass}`}>
                    {row.format(val)}
                  </td>
                );
              })}
            </tr>
          ))}
          {(section === "cashFlow" || section === "performance") && (
            <>
              <tr className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td
                  className="sticky left-0 bg-card px-3 py-2 text-xs font-medium text-foreground whitespace-nowrap cursor-help"
                  title="Owner Earnings = Lucro Líquido + D&A − Capex − ΔWorking Capital. Fórmula de Warren Buffett para o lucro real disponível para o dono do negócio. Quando faltam dados de D&A, Capex ou Working Capital nesse ano, o valor é aproximado pelo FCF reportado (marcado com ≈)."
                >
                  Owner Earnings ($M)
                </td>
                {sortedData.map(d => {
                  const oe = ownerEarningsByYear.get(d.year);
                  const diverges = oe && !oe.isApproximated && isSignificantDivergence(oe.ownerEarnings, d.fcf);
                  let cellTitle: string | undefined;
                  if (diverges && oe) {
                    const terms = [
                      { label: "D&A", value: oe.depreciationAmortization },
                      { label: "Capex", value: -oe.capexUsed },
                      { label: "ΔWorking Capital", value: -oe.deltaWorkingCapital },
                    ];
                    const dominant = terms.reduce((a, b) => Math.abs(b.value) > Math.abs(a.value) ? b : a);
                    cellTitle = `Owner Earnings ${d.year} = Lucro Líquido (${fmtNum(oe.netIncome)}) + D&A (${fmtNum(oe.depreciationAmortization)}) − Capex (${fmtNum(oe.capexUsed)}) − ΔWorking Capital (${fmtNum(oe.deltaWorkingCapital)}) = ${fmtNum(oe.ownerEarnings)}. FCF reportado = ${fmtNum(d.fcf)}. O termo com maior peso este ano é ${dominant.label} (${fmtNum(dominant.value)}), provavelmente o principal responsável pela diferença. Nota: o FCF reportado pode incluir ajustamentos não-caixa (ex: compensação em ações) que não estão nesta decomposição.`;
                  }
                  return (
                    <td
                      key={d.year}
                      className={`px-3 py-2 text-right font-mono text-xs ${diverges ? "cursor-help" : ""}`}
                      title={cellTitle}
                    >
                      {oe ? (
                        <>
                          {fmtNum(oe.ownerEarnings)}
                          {oe.isApproximated && <span className="ml-1 text-[10px] text-muted-foreground" title="Dados incompletos, aproximado pelo FCF">≈</span>}
                          {diverges && <span className="ml-1 text-[10px] text-neutral-warn">⚠️</span>}
                        </>
                      ) : "—"}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td className="sticky left-0 bg-card px-3 py-2 text-xs font-medium text-foreground whitespace-nowrap">
                  Owner Earnings Growth
                </td>
                {sortedData.map(d => {
                  const oe = ownerEarningsByYear.get(d.year);
                  const colorClass = oe ? getChangeColor(oe.ownerEarningsGrowth) : "";
                  return (
                    <td key={d.year} className={`px-3 py-2 text-right font-mono text-xs ${colorClass}`}>
                      {oe ? formatPercent(oe.ownerEarningsGrowth) : "—"}
                    </td>
                  );
                })}
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
