import { useState } from "react";
import { Company } from "@/lib/mockData";
import { calculateDCF, DCFInputs, DCFResult, formatCurrency, formatPercent } from "@/lib/calculations";
import { StatusBadge } from "./StatusBadge";

interface DCFCalculatorProps {
  company: Company;
}

export function DCFCalculator({ company }: DCFCalculatorProps) {
  const lastYear = company.financials[company.financials.length - 1];

  const [inputs, setInputs] = useState<DCFInputs>({
    method: "fcf",
    discountRate: 10,
    growthRate1to5: 8,
    growthRate6to10: 5,
    terminalGrowthRate: 2.5,
    marginOfSafety: 25,
  });

  const baseCF = inputs.method === "fcf" ? lastYear.fcf : lastYear.eps * company.sharesOutstanding;
  const result: DCFResult = calculateDCF(baseCF, company.sharesOutstanding, company.currentPrice, inputs);

  const updateInput = (key: keyof DCFInputs, value: number | string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
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
              { key: "terminalGrowthRate", label: "Crescimento terminal (%)" },
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
    </div>
  );
}
