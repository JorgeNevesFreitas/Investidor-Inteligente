import { useState, useMemo, useEffect, useRef } from "react";
import { Company } from "@/lib/mockData";
import { calculateDCF, DCFInputs, DCFResult, formatCurrency, formatPercent } from "@/lib/calculations";
import { saveDCFValuation, getDCFValuation } from "@/lib/dcfService";
import { StatusBadge } from "./StatusBadge";
import { Loader2 } from "lucide-react";

interface DCFCalculatorProps {
  company: Company;
  companyId?: string | null;
  marketPrice?: number | null;
  priceStatus?: 'loading' | 'success' | 'error' | 'unavailable';
  priceTimestamp?: string | null;
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

export function DCFCalculator({ company, companyId, marketPrice, priceStatus = 'success', priceTimestamp }: DCFCalculatorProps) {
  const lastYear = company.financials[company.financials.length - 1];
  const storageKey = `dcf-inputs-${company.ticker}`;

  const effectivePrice = (marketPrice && marketPrice > 0) ? marketPrice : (company.currentPrice > 0 ? company.currentPrice : null);
  const hasPriceValid = effectivePrice !== null && effectivePrice > 0;

  const [inputs, setInputs] = useState<FormInputs>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      method: "fcf",
      discountRate: "",
      growthRate1to5: "",
      growthRate6to10: "",
      terminalMultiple: "",
      marginOfSafety: "",
    };
  });

  // On mount: if localStorage is empty, load inputs from Supabase (cross-device restore)
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    const localSaved = localStorage.getItem(storageKey);
    if (localSaved) return;
    getDCFValuation(company.ticker).then(saved => {
      if (saved) setInputs(saved.inputs as FormInputs);
    });
  }, [company.ticker, storageKey]);

  const allFilled =
    inputs.discountRate !== "" &&
    inputs.growthRate1to5 !== "" &&
    inputs.growthRate6to10 !== "" &&
    inputs.terminalMultiple !== "" &&
    inputs.marginOfSafety !== "";

  const numInputs: DCFInputs = {
    method: inputs.method,
    discountRate: Number(inputs.discountRate) || 0,
    growthRate1to5: Number(inputs.growthRate1to5) || 0,
    growthRate6to10: Number(inputs.growthRate6to10) || 0,
    terminalMultiple: Number(inputs.terminalMultiple) || 0,
    marginOfSafety: Number(inputs.marginOfSafety) || 0,
  };

  const baseCF = inputs.method === "fcf" ? lastYear.fcf : lastYear.eps * company.sharesOutstanding;

  // Memoize result so save effects only fire when inputs actually change
  const result = useMemo((): DCFResult | null => {
    if (!allFilled || !hasPriceValid) return null;
    return calculateDCF(baseCF, company.sharesOutstanding, effectivePrice!, numInputs);
  }, [
    allFilled, hasPriceValid, baseCF, company.sharesOutstanding, effectivePrice,
    inputs.method, inputs.discountRate, inputs.growthRate1to5,
    inputs.growthRate6to10, inputs.terminalMultiple, inputs.marginOfSafety,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist inputs to localStorage
  useEffect(() => {
    const hasAnyValue = Object.entries(inputs).some(([k, v]) => k !== "method" && v !== "");
    if (hasAnyValue) localStorage.setItem(storageKey, JSON.stringify(inputs));
  }, [inputs, storageKey]);

  // Persist result to localStorage + Supabase
  useEffect(() => {
    if (!result) return;
    localStorage.setItem(`dcf-result-${company.ticker}`, JSON.stringify(result));
    saveDCFValuation(
      company.ticker,
      companyId ?? null,
      numInputs,
      result,
      effectivePrice ?? null
    );
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const badgeStatus = !hasPriceValid ? "no_price" : (result?.status || "no_price");

  const projections = useMemo(() => {
    if (!allFilled) return [];
    const rows: ProjectionRow[] = [];
    const baseYear = lastYear.year;
    let cf = baseCF;
    const dr = numInputs.discountRate / 100;

    for (let i = 1; i <= 5; i++) {
      cf = cf * (1 + numInputs.growthRate1to5 / 100);
      rows.push({ year: baseYear + i, label: `${baseYear + i}`, cashFlow: cf, presentValue: cf / Math.pow(1 + dr, i) });
    }
    for (let i = 6; i <= 10; i++) {
      cf = cf * (1 + numInputs.growthRate6to10 / 100);
      rows.push({ year: baseYear + i, label: `${baseYear + i}`, cashFlow: cf, presentValue: cf / Math.pow(1 + dr, i) });
    }
    const terminalValue = cf * numInputs.terminalMultiple;
    rows.push({ year: baseYear + 11, label: `${baseYear + 10} (TV)`, cashFlow: terminalValue, presentValue: terminalValue / Math.pow(1 + dr, 10), isTerminal: true });
    return rows;
  }, [baseCF, inputs, lastYear.year]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateInput = (key: keyof FormInputs, value: number | string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const formatM = (n: number) => {
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}T`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}B`;
    return n.toFixed(2);
  };

  const renderPriceValue = () => {
    if (priceStatus === 'loading') return <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />A carregar...</span>;
    if (!hasPriceValid) return <span className="text-muted-foreground">Indisponível</span>;
    return formatCurrency(effectivePrice!);
  };

  const renderUpside = () => {
    if (!result || !hasPriceValid) return <span className="text-muted-foreground">N/D</span>;
    if (!isFinite(result.upside) || isNaN(result.upside)) return <span className="text-muted-foreground">N/D</span>;
    return <span className={result.upside >= 0 ? "text-positive" : "text-negative"}>{formatPercent(result.upside)}</span>;
  };

  const renderIRR = () => {
    if (!result || !hasPriceValid) return <span className="text-muted-foreground">N/D</span>;
    if (!isFinite(result.irr) || isNaN(result.irr)) return <span className="text-muted-foreground">N/D</span>;
    return formatPercent(result.irr);
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
                  <button key={m} onClick={() => updateInput("method", m)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${inputs.method === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>
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
                <input type="number" step="0.5" value={inputs[key] as number | ""} placeholder="Obrigatório"
                  onChange={e => updateInput(key, e.target.value === "" ? "" : parseFloat(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            ))}
          </div>
        </div>

        {/* Results */}
        {allFilled ? (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Resultado</h3>
            <StatusBadge status={badgeStatus as any} animated={true} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Preço atual</span>
              <span className="font-mono text-sm font-semibold text-foreground">{renderPriceValue()}</span>
            </div>
            {priceTimestamp && hasPriceValid && (
              <div className="px-3 -mt-2">
                <span className="text-[10px] text-muted-foreground">
                  Atualizado: {new Date(priceTimestamp).toLocaleString('pt-PT')}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md px-3 py-2 gradient-glow">
              <span className="text-xs text-muted-foreground">Valor intrínseco / ação</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {result ? formatCurrency(result.intrinsicValuePerShare) : "N/D"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Com margem de segurança</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {result ? formatCurrency(result.intrinsicWithMargin) : "N/D"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Upside</span>
              <span className="font-mono text-sm font-semibold">{renderUpside()}</span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">IRR esperado</span>
              <span className="font-mono text-sm font-semibold text-foreground">{renderIRR()}</span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Market Cap intrínseco ($M)</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {result ? result.intrinsicValueTotal.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/D"}
              </span>
            </div>
          </div>

          {!hasPriceValid && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              ⚠️ Preço de mercado indisponível. Upside e classificação não podem ser calculados.
            </div>
          )}
        </div>
        ) : (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Preenche todos os parâmetros para ver o resultado</p>
        </div>
        )}
      </div>

      {allFilled && projections.length > 0 && (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">📊 Projeção de Cash Flows</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Base: {inputs.method === "fcf" ? "Free Cash Flow" : "EPS"} {lastYear.year} = {formatM(baseCF)} · Discount Rate: {numInputs.discountRate}%
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">
                  {inputs.method === "fcf" ? "Cash Flow" : "EPS"} ({lastYear.year})
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">{formatM(baseCF)}</th>
                {projections.map(p => (
                  <th key={p.label} className={`px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap ${p.isTerminal ? "text-primary" : "text-muted-foreground"}`}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">{inputs.method === "fcf" ? "Projected FCF" : "Projected EPS"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">—</td>
                {projections.map(p => (
                  <td key={p.label} className={`px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap ${p.isTerminal ? "text-primary font-semibold" : "text-foreground"}`}>{formatM(p.cashFlow)}</td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">PV ({numInputs.discountRate}%)</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">—</td>
                {projections.map(p => (
                  <td key={p.label} className={`px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap ${p.isTerminal ? "text-primary font-semibold" : "text-foreground"}`}>{formatM(p.presentValue)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
