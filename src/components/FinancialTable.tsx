import { FinancialYear } from "@/lib/mockData";
import { formatPercent, getChangeColor } from "@/lib/calculations";

type SectionKey = "performance" | "profitability" | "structure" | "incomeStatement" | "balanceSheet" | "cashFlow";

interface FinancialTableProps {
  data: FinancialYear[];
  section: SectionKey;
}

const fmtNum = (v: number) => v.toLocaleString();
const fmtDec = (v: number) => v.toFixed(2);

const sections: Record<SectionKey, { key: string; label: string; format: (v: any) => string; color?: boolean }[]> = {
  performance: [
    { key: "revenue", label: "Revenue ($M)", format: fmtNum },
    { key: "revenueGrowth", label: "Revenue Growth", format: formatPercent, color: true },
    { key: "grossProfit", label: "Gross Profit ($M)", format: fmtNum },
    { key: "grossMargin", label: "Gross Margin", format: formatPercent },
    { key: "operatingIncome", label: "Operating Income ($M)", format: fmtNum },
    { key: "ebitGrowth", label: "EBIT Growth", format: formatPercent, color: true },
    { key: "netIncome", label: "Net Income ($M)", format: fmtNum },
    { key: "netIncomeGrowth", label: "Net Income Growth", format: formatPercent, color: true },
    { key: "eps", label: "EPS ($)", format: fmtDec },
    { key: "epsGrowth", label: "EPS Growth", format: formatPercent, color: true },
    { key: "fcf", label: "Free Cash Flow ($M)", format: fmtNum },
    { key: "fcfGrowth", label: "FCF Growth", format: formatPercent, color: true },
  ],
  profitability: [
    { key: "roe", label: "ROE", format: formatPercent },
    { key: "netMargin", label: "Net Margin", format: formatPercent },
    { key: "operatingMargin", label: "Operating Margin", format: formatPercent },
    { key: "sgaToRevenue", label: "SG&A / Revenue", format: formatPercent },
    { key: "rdToRevenue", label: "R&D / Revenue", format: formatPercent },
  ],
  structure: [
    { key: "debtToEquity", label: "Debt / Equity", format: fmtDec },
    { key: "currentRatio", label: "Current Ratio", format: fmtDec },
    { key: "bookValuePerShare", label: "Book Value / Share ($)", format: fmtDec },
    { key: "bookValueGrowth", label: "BV Growth", format: formatPercent, color: true },
    { key: "sharesOutstanding", label: "Shares Outstanding (M)", format: fmtNum },
    { key: "dividends", label: "Dividends ($)", format: fmtDec },
    { key: "payoutRatio", label: "Payout Ratio", format: formatPercent },
  ],
  incomeStatement: [
    { key: "revenue", label: "Revenue ($M)", format: fmtNum },
    { key: "revenueGrowth", label: "Revenue Growth", format: formatPercent, color: true },
    { key: "grossProfit", label: "Gross Profit ($M)", format: fmtNum },
    { key: "grossMargin", label: "Gross Margin", format: formatPercent },
    { key: "operatingIncome", label: "Operating Income ($M)", format: fmtNum },
    { key: "operatingMargin", label: "Operating Margin", format: formatPercent },
    { key: "ebitGrowth", label: "EBIT Growth", format: formatPercent, color: true },
    { key: "netIncome", label: "Net Income ($M)", format: fmtNum },
    { key: "netIncomeGrowth", label: "Net Income Growth", format: formatPercent, color: true },
    { key: "netMargin", label: "Net Margin", format: formatPercent },
    { key: "eps", label: "EPS ($)", format: fmtDec },
    { key: "epsGrowth", label: "EPS Growth", format: formatPercent, color: true },
    { key: "sharesOutstanding", label: "Shares Outstanding (M)", format: fmtNum },
    { key: "sgaToRevenue", label: "SG&A / Revenue", format: formatPercent },
    { key: "rdToRevenue", label: "R&D / Revenue", format: formatPercent },
  ],
  balanceSheet: [
    { key: "bookValuePerShare", label: "Book Value / Share ($)", format: fmtDec },
    { key: "bookValueGrowth", label: "BV Growth", format: formatPercent, color: true },
    { key: "debtToEquity", label: "Debt / Equity", format: fmtDec },
    { key: "currentRatio", label: "Current Ratio", format: fmtDec },
    { key: "sharesOutstanding", label: "Shares Outstanding (M)", format: fmtNum },
    { key: "roe", label: "ROE", format: formatPercent },
  ],
  cashFlow: [
    { key: "fcf", label: "Free Cash Flow ($M)", format: fmtNum },
    { key: "fcfGrowth", label: "FCF Growth", format: formatPercent, color: true },
    { key: "dividends", label: "Dividends / Share ($)", format: fmtDec },
    { key: "payoutRatio", label: "Payout Ratio", format: formatPercent },
  ],
};

export function FinancialTable({ data, section }: FinancialTableProps) {
  const rows = sections[section];
  const sortedData = [...data].sort((a, b) => a.year - b.year);

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
              <td className="sticky left-0 bg-card px-3 py-2 text-xs font-medium text-foreground whitespace-nowrap">{row.label}</td>
              {sortedData.map(d => {
                const val = (d as any)[row.key];
                const colorClass = row.color ? getChangeColor(val) : "";
                return (
                  <td key={d.year} className={`px-3 py-2 text-right font-mono text-xs ${colorClass}`}>
                    {row.format(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
