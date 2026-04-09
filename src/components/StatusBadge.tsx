import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "invest" | "watch" | "wait" | "invested";
  className?: string;
}

const statusConfig = {
  invest: { label: "Investir", emoji: "🟢", className: "bg-positive text-positive" },
  watch: { label: "Atento", emoji: "🟡", className: "bg-neutral-warn text-neutral-warn" },
  wait: { label: "Aguardar", emoji: "🔴", className: "bg-negative text-negative" },
  invested: { label: "Investido", emoji: "🔵", className: "bg-info/15 text-info" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", config.className, className)}>
      <span>{config.emoji}</span>
      {config.label}
    </span>
  );
}
