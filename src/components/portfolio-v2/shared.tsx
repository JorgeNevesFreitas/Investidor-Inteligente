// Shared formatters and small presentational helpers for the Portfolio v2 components.
// Deliberately duplicated (in spirit) from Portfolio.tsx rather than imported, so the
// existing page is never touched by this work.

export const fmtEur = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

export const fmtEur2 = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v);

export const fmtCcy = (v: number, ccy: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${ccy}`;
  }
};

export const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
export const fmtPct2 = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

export const fmtQty = (v: number) =>
  v % 1 === 0 ? v.toFixed(0) : v.toFixed(4).replace(/\.?0+$/, "");

export function memberColor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("dinis")) return { bg: "bg-teal-600", bar: "bg-teal-500", dot: "bg-teal-500", text: "text-teal-500" };
  if (n.includes("mariana")) return { bg: "bg-purple-600", bar: "bg-purple-500", dot: "bg-purple-500", text: "text-purple-500" };
  return { bg: "bg-blue-600", bar: "bg-blue-500", dot: "bg-blue-500", text: "text-blue-500" };
}

export function MemberAvatar({ name }: { name: string }) {
  const initials = name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  const { bg } = memberColor(name);
  return (
    <div className={`flex items-center justify-center w-9 h-9 rounded-full ${bg} text-white text-xs font-bold shrink-0`}>
      {initials}
    </div>
  );
}

export function ReturnCell({ eur, pct }: { eur: number; pct: number }) {
  const pos = eur >= 0;
  return (
    <div className="text-right min-w-[80px]">
      <div className={`font-mono text-xs font-medium ${pos ? "text-positive" : "text-negative"}`}>
        {pos ? "+" : ""}{fmtEur(eur)}
      </div>
      <div className={`font-mono text-[10px] ${pos ? "text-positive/80" : "text-negative/80"}`}>
        {fmtPct(pct)}
      </div>
    </div>
  );
}
