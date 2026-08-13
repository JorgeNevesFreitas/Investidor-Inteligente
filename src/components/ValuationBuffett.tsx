// src/components/ValuationBuffett.tsx
//
// Modelo "estilo Buffett": Owner Earnings, crescimento próprio para os 10
// anos, crescimento perpétuo separado (Gordon Growth) para o Valor Terminal,
// taxa de desconto de referência (yield das obrigações do tesouro a 10
// anos, mostrada como nota, não pré-preenchida). Layout igual ao
// DCFCalculator (aba "Valuation"): grid de 2 colunas.

import { useState, useMemo, useEffect } from "react";
import { Company } from "@/lib/mockData";
import { computeOwnerEarnings, calculateBuffettValuation, isSignificantDivergence, BuffettInputs, BuffettResult } from "@/lib/calculationsBuffett";
import { formatCurrency, formatPercent } from "@/lib/calculations";
import { StatusBadge } from "./StatusBadge";
import { fetchMarketPrice } from "@/lib/marketPriceService";
import { Loader2 } from "lucide-react";

interface ValuationBuffettProps {
  company: Company;
  marketPrice?: number | null;
  priceStatus?: "loading" | "success" | "error" | "unavailable";
  priceTimestamp?: string | null;
}

interface ProjectionRow {
  year: number;
  label: string;
  ownerEarnings: number;
  presentValue: number;
  isTerminal?: boolean;
}

type FormInputs = {
  baseOwnerEarnings: number | "";
  growthRateNearTerm: number | "";
  growthRatePerpetual: number | "";
  discountRate: number | "";
  marginOfSafety: number | "";
};

const DEFAULT_GROWTH_PERPETUAL = 2;

export function ValuationBuffett({ company, marketPrice, priceStatus = "success", priceTimestamp }: ValuationBuffettProps) {
  const lastYear = company.financials[company.financials.length - 1];
  const storageKey = `buffett-inputs-${company.ticker}`;

  const effectivePrice = (marketPrice && marketPrice > 0) ? marketPrice : (company.currentPrice > 0 ? company.currentPrice : null);
  const hasPriceValid = effectivePrice !== null && effectivePrice > 0;

  const defaultBase = Number(computeOwnerEarnings(company.financials).toFixed(2));

  const [inputs, setInputs] = useState<FormInputs>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      baseOwnerEarnings: defaultBase,
      growthRateNearTerm: "",
      growthRatePerpetual: DEFAULT_GROWTH_PERPETUAL,
      discountRate: "",
      marginOfSafety: "",
    };
  });

  const divergesFromFCF = isSignificantDivergence(Number(inputs.baseOwnerEarnings) || 0, lastYear.fcf);

  const [treasuryYield, setTreasuryYield] = useState<number | null>(null);
  const [treasuryYieldStatus, setTreasuryYieldStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    fetchMarketPrice("^TNX").then((res) => {
      if (res.status === "success" && res.price > 0) {
        const yieldPct = res.price > 20 ? res.price / 10 : res.price;
        setTreasuryYield(Number(yieldPct.toFixed(2)));
        setTreasuryYieldStatus("success");
      } else {
        setTreasuryYieldStatus("error");
      }
    }).catch(() => setTreasuryYieldStatus("error"));
  }, []);

  useEffect(() => {
    const hasAnyValue = Object.entries(inputs).some(([, v]) => v !== "");
    if (hasAnyValue) {
      localStorage.setItem(storageKey, JSON.stringify(inputs));
    }
  }, [inputs, storageKey]);

  const allFilled = inputs.baseOwnerEarnings !== "" && inputs.growthRateNearTerm !== "" && inputs.growthRatePerpetual !== "" && inputs.discountRate !== "" && inputs.marginOfSafety !== "";

  const numInputs: BuffettInputs = {
    baseOwnerEarnings: Number(inputs.baseOwnerEarnings) || 0,
    growthRateNearTerm: Number(inputs.growthRateNearTerm) || 0,
    growthRatePerpetual: Number(inputs.growthRatePerpetual) || 0,
    discountRate: Number(inputs.discountRate) || 0,
    marginOfSafety: Number(inputs.marginOfSafety) || 0,
  };

  const rateInvalid = numInputs.discountRate <= numInputs.growthRatePerpetual && allFilled;

  const result: BuffettResult | null = useMemo(() => {
    if (!allFilled || !hasPriceValid || rateInvalid) return null;
    return calculateBuffettValuation(numInputs, company.sharesOutstanding, effectivePrice!);
  }, [allFilled, hasPriceValid, rateInvalid, JSON.stringify(numInputs), company.sharesOutstanding, effectivePrice]);

  useEffect(() => {
    const resultKey = `buffett-result-${company.ticker}`;
    if (result && !result.invalidRate) {
      localStorage.setItem(resultKey, JSON.stringify(result));
    }
  }, [result, company.ticker]);

  const badgeStatus = !hasPriceValid ? "no_price" : (result?.status || "no_price");

  const projections = useMemo((): ProjectionRow[] => {
    if (!allFilled || rateInvalid) return [];
    const rows: ProjectionRow[] = [];
    const baseYear = lastYear.year;
    let oe = numInputs.baseOwnerEarnings;
    const r = numInputs.discountRate / 100;

    for (let i = 1; i <= 10; i++) {
      oe = oe * (1 + numInputs.growthRateNearTerm / 100);
      rows.push({ year: baseYear + i, label: `${baseYear + i}`, ownerEarnings: oe, presentValue: oe / Math.pow(1 + r, i) });
    }
    const g = numInputs.growthRatePerpetual / 100;
    const terminalValue = (oe * (1 + g)) / (r - g);
    rows.push({ year: baseYear + 11, label: `${baseYear + 10} (TV)`, ownerEarnings: terminalValue, presentValue: terminalValue / Math.pow(1 + r, 10), isTerminal: true });
    return rows;
  }, [inputs, lastYear.year, allFilled, rateInvalid]);

  const updateInput = (key: keyof FormInputs, value: number | string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const formatM = (n: number) => {
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}T`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}B`;
    return n.toFixed(2);
  };

  const renderPriceValue = () => {
    if (priceStatus === "loading") return <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />A carregar...</span>;
    if (!hasPriceValid) return <span className="text-muted-foreground">Indisponível</span>;
    return formatCurrency(effectivePrice!);
  };

  const renderUpside = () => {
    if (!result) return <span className="text-muted-foreground">N/D</span>;
    if (!isFinite(result.upside) || isNaN(result.upside)) return <span className="text-muted-foreground">N/D</span>;
    return <span className={result.upside >= 0 ? "text-positive" : "text-negative"}>{formatPercent(result.upside)}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Parâmetros Buffett (Owner Earnings)</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Owner Earnings de partida ($M)</label>
              <input type="number" step="0.01" value={inputs.baseOwnerEarnings}
                onChange={(e) => updateInput("baseOwnerEarnings", e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
              {divergesFromFCF && (
                <p className="mt-1 text-[10px] text-neutral-warn">
                  ⚠️ Este valor diverge muito do FCF reportado ({lastYear.fcf.toLocaleString(undefined, { maximumFractionDigits: 0 })} $M em {lastYear.year}). Verifica os dados financeiros desta empresa (aba Financials) ou considera usar o FCF como valor de partida.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Crescimento anos 1-10 (%)</label>
              <input type="number" step="0.5" value={inputs.growthRateNearTerm} placeholder="Obrigatório"
                onChange={(e) => updateInput("growthRateNearTerm", e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Crescimento perpétuo (%)</label>
              <input type="number" step="0.1" value={inputs.growthRatePerpetual} placeholder="Obrigatório"
                onChange={(e) => updateInput("growthRatePerpetual", e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Intervalo lógico: 0% a 3%, abaixo do crescimento nominal de longo prazo da economia. Acima disto assume-se crescimento infinito irrealista.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Taxa de desconto (%)</label>
              <input type="number" step="0.1" value={inputs.discountRate} placeholder="Obrigatório"
                onChange={(e) => updateInput("discountRate", e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {treasuryYieldStatus === "loading" && "A obter yield atual das obrigações a 10 anos..."}
                {treasuryYieldStatus === "success" && `Referência: yield atual das obrigações do tesouro a 10 anos = ${treasuryYield}%`}
                {treasuryYieldStatus === "error" && "Yield das obrigações indisponível de momento."}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Margem de segurança (%)</label>
              <input type="number" step="1" value={inputs.marginOfSafety} placeholder="Obrigatório"
                onChange={(e) => updateInput("marginOfSafety", e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              A taxa de desconto reflete o custo de oportunidade "sem risco". O risco do negócio não entra aqui, é
              filtrado na escolha da empresa e compensado pela margem de segurança aplicada no fim, tipicamente
              entre 25% e 50%. Se aumentares a taxa de desconto para refletir mais risco, deves reduzir a margem de
              segurança correspondente, para não aplicares conservadorismo a dobrar.
            </p>
          </div>

          {rateInvalid && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              ⚠️ A taxa de desconto tem de ser maior do que o crescimento perpétuo, ou a fórmula da perpetuidade não é válida.
            </div>
          )}
        </div>

        {/* Results */}
        {allFilled && !rateInvalid ? (
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
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Market Cap atual ($M)</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {hasPriceValid ? (effectivePrice! * company.sharesOutstanding).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/D"}
              </span>
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
              <span className="text-xs text-muted-foreground">IRR esperado (ao preço atual)</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {result ? formatPercent(result.irrAtCurrentPrice) : "N/D"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">IRR esperado (ao preço da VI da MS)</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {result ? formatPercent(result.irrAtMarginPrice) : "N/D"}
              </span>
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

      {allFilled && !rateInvalid && projections.length > 0 && (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">📊 Projeção de Owner Earnings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Base: Owner Earnings {lastYear.year} = {formatM(numInputs.baseOwnerEarnings)} · Crescimento 1-10 anos: {numInputs.growthRateNearTerm}% · Crescimento perpétuo: {numInputs.growthRatePerpetual}% · Discount Rate: {numInputs.discountRate}%
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">
                  Owner Earnings ({lastYear.year})
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">{formatM(numInputs.baseOwnerEarnings)}</th>
                {projections.map((p) => (
                  <th key={p.label} className={`px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap ${p.isTerminal ? "text-primary" : "text-muted-foreground"}`}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">Projected OE</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">—</td>
                {projections.map((p) => (
                  <td key={p.label} className={`px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap ${p.isTerminal ? "text-primary font-semibold" : "text-foreground"}`}>{formatM(p.ownerEarnings)}</td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">PV ({numInputs.discountRate}%)</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">—</td>
                {projections.map((p) => (
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
