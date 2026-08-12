// src/components/ValuationSC.tsx
//
// Componente para a aba "Valuation SC", modelo de 3 cenários ponderados
// (normal / otimista / pessimista) fiel à folha Excel do Sven Carlin.
//
// Não substitui nem altera o DCFCalculator existente.

import { useState, useMemo, useEffect } from "react";
import { Company } from "@/lib/mockData";
import {
  calculateSvenCarlinValuation,
  SCValuationInputs,
  SCValuationResult,
  ScenarioInputs,
  SC_DEFAULT_INPUTS,
} from "@/lib/calculationsSC";
import { formatCurrency, formatPercent } from "@/lib/calculations";
import { StatusBadge } from "./StatusBadge";
import { Loader2 } from "lucide-react";

interface ValuationSCProps {
  company: Company;
  marketPrice?: number | null;
  priceStatus?: "loading" | "success" | "error" | "unavailable";
}

type ScenarioFormInputs = {
  /** Em modo FCF: valor total da empresa ($M). Em modo EPS: valor por ação ($). */
  baseValuePerShare: number | "";
  growthRate1to5: number | "";
  growthRate6to10: number | "";
  discountRate: number | "";
  terminalMultiple: number | "";
  probability: number | "";
};

type FormInputs = {
  method: "fcf" | "eps";
  dividendPayoutRatio: number | "";
  marginOfSafety: number | "";
  scenario1: ScenarioFormInputs;
  scenario2: ScenarioFormInputs;
  scenario3: ScenarioFormInputs;
};

type ScenarioKey = "scenario1" | "scenario2" | "scenario3";

// Formato usado pelo DCFCalculator existente (aba "Valuation"), para reaproveitar
// os inputs já preenchidos pelo utilizador como ponto de partida.
type SavedDCFInputs = {
  method?: "fcf" | "eps";
  discountRate?: number | "";
  growthRate1to5?: number | "";
  growthRate6to10?: number | "";
  terminalMultiple?: number | "";
  marginOfSafety?: number | "";
};

const SCENARIO_META: { key: ScenarioKey; title: string; shortTitle: string; accent: string }[] = [
  { key: "scenario1", title: "Cenário 1 · Normal", shortTitle: "Cenário 1", accent: "text-foreground" },
  { key: "scenario2", title: "Cenário 2 · Otimista", shortTitle: "Cenário 2", accent: "text-positive" },
  { key: "scenario3", title: "Cenário 3 · Pessimista", shortTitle: "Cenário 3", accent: "text-negative" },
];

export function ValuationSC({ company, marketPrice, priceStatus = "success" }: ValuationSCProps) {
  const lastYear = company.financials[company.financials.length - 1];
  const storageKey = `sc-valuation-inputs-${company.ticker}`;

  const effectivePrice = (marketPrice && marketPrice > 0) ? marketPrice : (company.currentPrice > 0 ? company.currentPrice : null);
  const hasPriceValid = effectivePrice !== null && effectivePrice > 0;

  const baseValueFromMethod = (method: "fcf" | "eps") =>
    method === "fcf" ? lastYear.fcf : lastYear.eps;

  const buildDefaultInputs = (): FormInputs => {
    let dcfSaved: SavedDCFInputs = {};
    try {
      const raw = localStorage.getItem(`dcf-inputs-${company.ticker}`);
      if (raw) dcfSaved = JSON.parse(raw);
    } catch {}

    const method: "fcf" | "eps" = dcfSaved.method === "eps" ? "eps" : "fcf";
    const base = Number(baseValueFromMethod(method).toFixed(2));

    const baselineFields = {
      growthRate1to5: (dcfSaved.growthRate1to5 !== undefined && dcfSaved.growthRate1to5 !== "")
        ? Number(dcfSaved.growthRate1to5) : SC_DEFAULT_INPUTS.scenario1.growthRate1to5,
      growthRate6to10: (dcfSaved.growthRate6to10 !== undefined && dcfSaved.growthRate6to10 !== "")
        ? Number(dcfSaved.growthRate6to10) : SC_DEFAULT_INPUTS.scenario1.growthRate6to10,
      discountRate: (dcfSaved.discountRate !== undefined && dcfSaved.discountRate !== "")
        ? Number(dcfSaved.discountRate) : SC_DEFAULT_INPUTS.scenario1.discountRate,
      terminalMultiple: (dcfSaved.terminalMultiple !== undefined && dcfSaved.terminalMultiple !== "")
        ? Number(dcfSaved.terminalMultiple) : SC_DEFAULT_INPUTS.scenario1.terminalMultiple,
    };

    const marginOfSafety: number | "" =
      (dcfSaved.marginOfSafety !== undefined && dcfSaved.marginOfSafety !== "") ? Number(dcfSaved.marginOfSafety) : "";

    return {
      method,
      dividendPayoutRatio: Number((lastYear.payoutRatio ?? 0).toFixed(2)),
      marginOfSafety,
      scenario1: { ...baselineFields, baseValuePerShare: base, probability: SC_DEFAULT_INPUTS.scenario1.probability },
      scenario2: { ...baselineFields, baseValuePerShare: base, probability: SC_DEFAULT_INPUTS.scenario2.probability },
      scenario3: { ...baselineFields, baseValuePerShare: base, probability: SC_DEFAULT_INPUTS.scenario3.probability },
    };
  };

  const [inputs, setInputs] = useState<FormInputs>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return buildDefaultInputs();
  });

  const [detailScenario, setDetailScenario] = useState<ScenarioKey>("scenario1");
  const [focusedBaseKey, setFocusedBaseKey] = useState<ScenarioKey | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(inputs));
  }, [inputs, storageKey]);

  const updateScenario = (
    scenario: ScenarioKey,
    key: keyof ScenarioFormInputs,
    value: number | string
  ) => {
    setInputs((prev) => {
      const next = { ...prev, [scenario]: { ...prev[scenario], [key]: value } };
      if (scenario === "scenario1" && key === "baseValuePerShare") {
        next.scenario2 = { ...next.scenario2, baseValuePerShare: value };
        next.scenario3 = { ...next.scenario3, baseValuePerShare: value };
      }
      return next;
    });
  };

  const updateMethod = (method: "fcf" | "eps") => {
    const base = Number(baseValueFromMethod(method).toFixed(2));
    setInputs((prev) => ({
      ...prev,
      method,
      scenario1: { ...prev.scenario1, baseValuePerShare: base },
      scenario2: { ...prev.scenario2, baseValuePerShare: base },
      scenario3: { ...prev.scenario3, baseValuePerShare: base },
    }));
  };

  const scenarioFilled = (s: ScenarioFormInputs) =>
    s.baseValuePerShare !== "" &&
    s.growthRate1to5 !== "" &&
    s.growthRate6to10 !== "" &&
    s.discountRate !== "" &&
    s.terminalMultiple !== "" &&
    s.probability !== "";

  const allFilled =
    inputs.dividendPayoutRatio !== "" &&
    inputs.marginOfSafety !== "" &&
    scenarioFilled(inputs.scenario1) &&
    scenarioFilled(inputs.scenario2) &&
    scenarioFilled(inputs.scenario3);

  const toPerShareBase = (displayValue: number) =>
    inputs.method === "fcf" ? displayValue / company.sharesOutstanding : displayValue;

  const toScenarioInputs = (s: ScenarioFormInputs): ScenarioInputs => ({
    baseValuePerShare: toPerShareBase(Number(s.baseValuePerShare) || 0),
    growthRate1to5: Number(s.growthRate1to5) || 0,
    growthRate6to10: Number(s.growthRate6to10) || 0,
    discountRate: Number(s.discountRate) || 0,
    terminalMultiple: Number(s.terminalMultiple) || 0,
    probability: Number(s.probability) || 0,
  });

  const scInputs: SCValuationInputs = {
    method: inputs.method,
    dividendPayoutRatio: Number(inputs.dividendPayoutRatio) || 0,
    marginOfSafety: Number(inputs.marginOfSafety) || 0,
    scenario1: toScenarioInputs(inputs.scenario1),
    scenario2: toScenarioInputs(inputs.scenario2),
    scenario3: toScenarioInputs(inputs.scenario3),
  };

  const probabilitySum =
    (Number(inputs.scenario1.probability) || 0) +
    (Number(inputs.scenario2.probability) || 0) +
    (Number(inputs.scenario3.probability) || 0);

  const result: SCValuationResult | null = useMemo(() => {
    if (!allFilled || !hasPriceValid) return null;
    return calculateSvenCarlinValuation(scInputs, company.sharesOutstanding, effectivePrice!);
  }, [allFilled, hasPriceValid, JSON.stringify(scInputs), company.sharesOutstanding, effectivePrice]);

  const badgeStatus = !hasPriceValid ? "no_price" : (result?.status || "no_price");

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

  const renderImpliedRate = () => {
    if (!result) return <span className="text-muted-foreground">N/D</span>;
    if (!isFinite(result.impliedDiscountRate) || isNaN(result.impliedDiscountRate)) return <span className="text-muted-foreground">N/D</span>;
    return formatPercent(result.impliedDiscountRate);
  };

  const inputClass = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
  const labelClass = "text-xs text-muted-foreground";

  const formatSpaced = (n: number) =>
    "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const detailScenarioMeta = SCENARIO_META.find((s) => s.key === detailScenario)!;
  const detailScenarioResult = result ? result[detailScenario] : null;
  const detailScenarioFormInputs = inputs[detailScenario];
  const detailBaseValueDisplay = Number(detailScenarioFormInputs.baseValuePerShare) || 0;
  const detailTerminalMultiple = Number(detailScenarioFormInputs.terminalMultiple) || 0;
  const displayScale = inputs.method === "fcf" ? company.sharesOutstanding : 1;
  const baseValueLabel = inputs.method === "fcf" ? "Valor base (FCF total, $M)" : "Valor base por ação (EPS)";
  const projectionTitle = inputs.method === "fcf" ? "Projeção de FCF" : "Projeção de EPS";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">📈 Valuation SC (Sven Carlin · 3 cenários)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Modelo com 3 cenários ponderados, fiel à folha original.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Método base</label>
            <div className="mt-1 flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => updateMethod("fcf")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${inputs.method === "fcf" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
              >
                FCF total
              </button>
              <button
                type="button"
                onClick={() => updateMethod("eps")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${inputs.method === "eps" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
              >
                EPS
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Dividend Payout Ratio (%)</label>
            <input
              type="number"
              className={`${inputClass} mt-1`}
              value={inputs.dividendPayoutRatio}
              onChange={(e) => setInputs((prev) => ({ ...prev, dividendPayoutRatio: e.target.value === "" ? "" : Number(e.target.value) }))}
              placeholder="Ex: 100"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Pré-preenchido a partir do payout ratio do último ano. 100% = sem efeito no cálculo.
            </p>
          </div>

          <div>
            <label className={labelClass}>Margem de segurança (%)</label>
            <input
              type="number"
              className={`${inputClass} mt-1`}
              value={inputs.marginOfSafety}
              onChange={(e) => setInputs((prev) => ({ ...prev, marginOfSafety: e.target.value === "" ? "" : Number(e.target.value) }))}
              placeholder="Ex: 25"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {SCENARIO_META.map(({ key, title, accent }) => {
          const s = inputs[key];
          return (
            <div key={key} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h4 className={`text-sm font-semibold ${accent}`}>{title}</h4>

              <div>
                <label className={labelClass}>{baseValueLabel}</label>
                <input
                  type={focusedBaseKey === key ? "number" : "text"}
                  step="0.01"
                  className={`${inputClass} mt-1`}
                  value={
                    focusedBaseKey === key
                      ? s.baseValuePerShare
                      : (s.baseValuePerShare === "" ? "" : (Number(s.baseValuePerShare)).toLocaleString(undefined, { maximumFractionDigits: 2 }))
                  }
                  onFocus={() => setFocusedBaseKey(key)}
                  onBlur={() => setFocusedBaseKey(null)}
                  onChange={(e) => updateScenario(key, "baseValuePerShare", e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Cresc. 1-5 anos (%)</label>
                  <input
                    type="number"
                    className={`${inputClass} mt-1`}
                    value={s.growthRate1to5}
                    onChange={(e) => updateScenario(key, "growthRate1to5", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cresc. 6-10 anos (%)</label>
                  <input
                    type="number"
                    className={`${inputClass} mt-1`}
                    value={s.growthRate6to10}
                    onChange={(e) => updateScenario(key, "growthRate6to10", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Taxa de desconto (%)</label>
                  <input
                    type="number"
                    className={`${inputClass} mt-1`}
                    value={s.discountRate}
                    onChange={(e) => updateScenario(key, "discountRate", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Terminal Multiple</label>
                  <input
                    type="number"
                    className={`${inputClass} mt-1`}
                    value={s.terminalMultiple}
                    onChange={(e) => updateScenario(key, "terminalMultiple", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Probabilidade (%)</label>
                <input
                  type="number"
                  className={`${inputClass} mt-1`}
                  value={s.probability}
                  onChange={(e) => updateScenario(key, "probability", e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>

              {result && (
                <div className="pt-2 border-t border-border/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Valor intrínseco por ação</span>
                    <span className="font-mono text-sm font-semibold">
                      {formatCurrency(result[key].intrinsicValuePerShare)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Com margem de segurança</span>
                    <span className="font-mono text-sm font-semibold text-muted-foreground">
                      {formatCurrency(result[key].intrinsicValuePerShare * (1 - (Number(inputs.marginOfSafety) || 0) / 100))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Valor total da empresa (informativo)</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {(result[key].intrinsicValuePerShare * company.sharesOutstanding).toLocaleString(undefined, { maximumFractionDigits: 0 })} $M
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {probabilitySum !== 100 && (
        <div className="rounded-md border border-neutral-warn/30 bg-neutral-warn/5 px-3 py-2 text-xs text-neutral-warn">
          ⚠️ A soma das probabilidades é {probabilitySum}%. Na folha original soma sempre 100%.
        </div>
      )}

      {allFilled && hasPriceValid ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Resultado ponderado</h3>
            <StatusBadge status={badgeStatus} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Preço atual</span>
              <span className="font-mono text-sm font-semibold text-foreground">{renderPriceValue()}</span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Taxa de desconto obtida ao preço atual</span>
              <span className="font-mono text-sm font-semibold text-foreground">{renderImpliedRate()}</span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Valor intrínseco por ação</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {result ? formatCurrency(result.weightedIntrinsicValuePerShare) : "N/D"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Market Cap intrínseco ($M, informativo)</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {result ? result.weightedIntrinsicValueTotal.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/D"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Com margem de segurança</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {result ? formatCurrency(result.weightedWithMargin) : "N/D"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md px-3 py-2 bg-secondary/50">
              <span className="text-xs text-muted-foreground">Upside</span>
              <span className="font-mono text-sm font-semibold">{renderUpside()}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Preenche todos os parâmetros dos 3 cenários para ver o resultado</p>
        </div>
      )}

      {/* Tabela de detalhe, anos na horizontal, para conferir célula a célula com o Excel */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">{projectionTitle}</h3>
          <div className="flex rounded-md border border-border overflow-hidden">
            {SCENARIO_META.map(({ key, shortTitle }) => (
              <button
                key={key}
                type="button"
                onClick={() => setDetailScenario(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${detailScenario === key ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
              >
                {shortTitle}
              </button>
            ))}
          </div>
        </div>

        {detailScenarioResult ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">Ano</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">Base ({lastYear.year})</th>
                    {detailScenarioResult.rows.map((row) => (
                      <th key={row.yearOffset} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                        {lastYear.year + row.yearOffset}
                        {row.yearOffset === 9 && <span className="ml-1 text-primary">*</span>}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right text-xs font-medium text-primary whitespace-nowrap">Valor Terminal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">
                      {inputs.method === "fcf" ? "FCF total ($M)" : "EPS ($)"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{formatSpaced(detailBaseValueDisplay)}</td>
                    {detailScenarioResult.rows.map((row) => (
                      <td key={row.yearOffset} className="px-3 py-2 text-right font-mono text-xs text-foreground">
                        {formatSpaced(row.cashFlow * displayScale)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-mono text-xs text-primary font-semibold">
                      {formatSpaced(detailScenarioResult.terminalValue * displayScale)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">Valor presente</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">—</td>
                    {detailScenarioResult.rows.map((row) => (
                      <td key={row.yearOffset} className="px-3 py-2 text-right font-mono text-xs text-foreground">
                        {formatSpaced(row.presentValue * displayScale)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-mono text-xs text-primary font-semibold">
                      {formatSpaced(detailScenarioResult.presentValueTerminal * displayScale)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              * Ano base do Valor Terminal (CF {lastYear.year + 9} × {detailTerminalMultiple})
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
              <span className="text-xs text-muted-foreground">
                Valor intrínseco total da empresa (informativo): {(detailScenarioResult.intrinsicValuePerShare * company.sharesOutstanding).toLocaleString(undefined, { maximumFractionDigits: 0 })} $M
              </span>
              <span className="text-sm font-semibold text-foreground">
                Valor intrínseco por ação ({detailScenarioMeta.shortTitle}): {formatCurrency(detailScenarioResult.intrinsicValuePerShare)}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">Preenche todos os parâmetros para ver o detalhe do cálculo</p>
        )}
      </div>
    </div>
  );
}
