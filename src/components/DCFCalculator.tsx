import { useState, useMemo } from "react";
import { Company } from "@/lib/mockData";
import { calculateDCF, DCFInputs, DCFResult, formatCurrency, formatPercent } from "@/lib/calculations";
import { StatusBadge } from "./StatusBadge";

interface DCFCalculatorProps {
  company: Company;
}

interface ProjectionRow {
  year: number;
  label: string;
  cashFlow: number;
  presentValue: number;
  isTerminal?: boolean;
}

type FormInputs = {
  method: "fcf" | "eps";
  discountRate: number | "";
  growthRate1to5: number | "";
  growthRate6to10: number | "";
  terminalMultiple: number | "";
  marginOfSafety: number | "";
};

export function DCFCalculator({ company }: DCFCalculatorProps) {
  const lastYear = company.financials[company.financials.length - 1];

  const [inputs, setInputs] = useState<FormInputs>({
    method: "fcf",
    discountRate: "",
    growthRate1to5: "",
    growthRate6to10: "",
    terminalMultiple: "",
    marginOfSafety: "",
  });

  const allFilled = inputs.discountRate !== "" && inputs.growthRate1to5 !== "" && inputs.growthRate6to10 !== "" && inputs.terminalMultiple !== "" && inputs.marginOfSafety !== "";

  const numInputs: DCFInputs = {
    method: inputs.method,
    discountRate: Number(inputs.discountRate) || 0,
    growthRate1to5: Number(inputs.growthRate1to5) || 0,
    growthRate6to10: Number(inputs.growthRate6to10) || 0,
    terminalMultiple: Number(inputs.terminalMultiple) || 0,
    marginOfSafety: Number(inputs.marginOfSafety) || 0,
  };

  const baseCF = inputs.method === "fcf" ? lastYear.fcf : lastYear.eps * company.sharesOutstanding;
  const result: DCFResult | null = allFilled ? calculateDCF(baseCF, company.sharesOutstanding, company.currentPrice, numInputs) : null;

  const projections = useMemo(() => {
    const rows: ProjectionRow[] = [];
    const baseYear = lastYear.year;
    let cf = baseCF;
    const dr = inputs.discountRate / 100;

    for (let i = 1; i <= 5; i++) {
      cf = cf * (1 + inputs.growthRate1to5 / 100);
      rows.push({
        year: baseYear + i,
        label: `${baseYear + i}`,
        cashFlow: cf,
        presentValue: cf / Math.pow(1 + dr, i),
      });
    }
    for (let i = 6; i <= 10; i++) {
      cf = cf * (1 + inputs.growthRate6to10 / 100);
      rows.push({
        year: baseYear + i,
        label: `${baseYear + i}`,
        cashFlow: cf,
        presentValue: cf / Math.pow(1 + dr, i),
      });
    }
    const terminalValue = cf * inputs.terminalMultiple;
    rows.push({
      year: baseYear + 11,
      label: `${baseYear + 10} (TV)`,
      cashFlow: terminalValue,
      presentValue: terminalValue / Math.pow(1 + dr, 10),
      isTerminal: true,
    });
    return rows;
  }, [baseCF, inputs, lastYear.year]);

  const updateInput = (key: keyof DCFInputs, value: number | string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const formatM = (n: number) => {
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}T`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}B`;
    return n.toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Parâmetros DCF</h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Método</label>
              <div className="mt-1 flex gap-2">
                {(["fcf", "eps"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => updateInput("method", m)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      inputs.method === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
                    }`}
                  >
                    {m === "fcf" ? "Free Cash Flow" : "EPS"}
                  </button>
                ))}
              </div>
            </div>

            {([
              { key: "discountRate", label: "Taxa de desconto (%)" },
              { key: "growthRate1to5", label: "Crescimento anos 1-5 (%)" },
              { key: "growthRate6to10", label: "Crescimento anos 6-10 (%)" },
              { key: "terminalMultiple", label: "Terminal Multiple (10-15x)" },
              { key: "marginOfSafety", label: "Margem de segurança (%)" },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground">{label}</label>
                <input
                  type="number"
                  step="0.5"
                  value={inputs[key] as number}
                  onChange={e => updateInput(key, parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Resultado</h3>
            <StatusBadge status={result.status} />
          </div>

          <div className="space-y-3">
            {([
              { label: "Preço atual", value: formatCurrency(result.currentPrice) },
              { label: "Valor intrínseco / ação", value: formatCurrency(result.intrinsicValuePerShare), highlight: true },
              { label: "Com margem de segurança", value: formatCurrency(result.intrinsicWithMargin) },
              { label: "Upside", value: formatPercent(result.upside), color: result.upside >= 0 },
              { label: "IRR esperado", value: formatPercent(result.irr) },
              { label: "Market Cap intrínseco ($M)", value: result.intrinsicValueTotal.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
            ]).map(({ label, value, highlight, color }) => (
              <div key={label} className={`flex items-center justify-between rounded-md px-3 py-2 ${highlight ? "gradient-glow" : "bg-secondary/50"}`}>
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className={`font-mono text-sm font-semibold ${
                  color !== undefined ? (color ? "text-positive" : "text-negative") : "text-foreground"
                }`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Projection Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">📊 Projeção de Cash Flows</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Base: {inputs.method === "fcf" ? "Free Cash Flow" : "EPS"} {lastYear.year} = {formatM(baseCF)} · Discount Rate: {inputs.discountRate}%
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">
                  {inputs.method === "fcf" ? "Cash Flow" : "EPS"} ({lastYear.year})
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {formatM(baseCF)}
                </th>
                {projections.map(p => (
                  <th
                    key={p.label}
                    className={`px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap ${
                      p.isTerminal ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">
                  Projected CF
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">—</td>
                {projections.map(p => (
                  <td
                    key={p.label}
                    className={`px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap ${
                      p.isTerminal ? "text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    {formatM(p.cashFlow)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">
                  PV ({inputs.discountRate}%)
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">—</td>
                {projections.map(p => (
                  <td
                    key={p.label}
                    className={`px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap ${
                      p.isTerminal ? "text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    {formatM(p.presentValue)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
