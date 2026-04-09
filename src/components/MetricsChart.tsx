import { FinancialYear } from "@/lib/mockData";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface MetricsChartProps {
  data: FinancialYear[];
  dataKey: keyof FinancialYear;
  label: string;
  color?: string;
  formatValue?: (v: number) => string;
}

export function MetricsChart({ data, dataKey, label, color = "hsl(142, 60%, 45%)", formatValue }: MetricsChartProps) {
  const sorted = [...data].sort((a, b) => a.year - b.year);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="mb-3 text-xs font-medium text-muted-foreground">{label}</h4>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={sorted}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} axisLine={false} tickLine={false} tickFormatter={formatValue} />
          <Tooltip
            contentStyle={{ background: "hsl(220, 18%, 12%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: "8px", fontSize: "12px" }}
            labelStyle={{ color: "hsl(210, 20%, 80%)" }}
            formatter={(val: number) => [formatValue ? formatValue(val) : val.toLocaleString(), label]}
          />
          <Line type="monotone" dataKey={dataKey as string} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
