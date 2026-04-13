import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "invest" | "watch" | "wait" | "invested" | "no_price";
  className?: string;
  animated?: boolean;
}

const statusConfig = {
  invest: { label: "Investir", className: "bg-positive/15 text-positive border-positive/30", dotClass: "bg-positive" },
  watch: { label: "Atento", className: "bg-neutral-warn/15 text-neutral-warn border-neutral-warn/30", dotClass: "bg-neutral-warn" },
  wait: { label: "Aguardar", className: "bg-negative/15 text-negative border-negative/30", dotClass: "bg-negative" },
  invested: { label: "Investido", className: "bg-info/15 text-info border-info/30", dotClass: "bg-info" },
  no_price: { label: "Sem preço", className: "bg-muted text-muted-foreground border-border", dotClass: "bg-muted-foreground" },
};

export function StatusBadge({ status, className, animated = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={cn(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
      config.className,
      className,
    )}>
      <span className="relative flex h-2.5 w-2.5">
        {animated && (
          <span className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
            config.dotClass,
          )} />
        )}
        <span className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full",
          config.dotClass,
        )} />
      </span>
      {config.label}
    </span>
  );
}
