import { cn, formatPKR } from "@/lib/utils";

export function KpiCard({
  title,
  value,
  subtitle,
  variant = "default",
  className,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  variant?: "default" | "success" | "danger" | "warning" | "info";
  className?: string;
}) {
  const colors = {
    default: "border-slate-200 bg-white",
    success: "border-emerald-200 bg-emerald-50",
    danger: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    info: "border-sky-200 bg-sky-50",
  };
  const valueColors = {
    default: "text-slate-900",
    success: "text-emerald-700",
    danger: "text-red-700",
    warning: "text-amber-700",
    info: "text-sky-700",
  };

  const display =
    typeof value === "number" ? formatPKR(value) : value;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 shadow-sm",
        colors[variant],
        className
      )}
    >
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {title}
      </p>
      <p className={cn("text-xl font-bold mt-1", valueColors[variant])}>
        {display}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
