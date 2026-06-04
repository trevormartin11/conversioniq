import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "bad" | "brand";
}) {
  const toneClass = {
    default: "text-slate-100",
    ok: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
    brand: "text-brand-400",
  }[tone];
  return (
    <div className="card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn("mt-2 font-mono text-[26px] font-semibold leading-none tabular-nums sm:text-3xl", toneClass)}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
