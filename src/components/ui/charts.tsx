import { cn } from "@/lib/utils";

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "ok" | "warn" | "bad" }) {
  const bar = { brand: "bg-brand-500", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

/** Tiny inline trend line. `data` is any numeric series. */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const w = 120;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / span) * (h - 4) - 2}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-8 w-full text-brand-400", className)} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Horizontal labeled bar (used for reply-by-type breakdown). */
export function LabeledBar({ label, value, max, tone = "brand" }: { label: string; value: number; max: number; tone?: "brand" | "ok" | "warn" | "bad" | "slate" }) {
  const bar = { brand: "bg-brand-500", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", slate: "bg-slate-500" }[tone];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-700">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right tabular-nums text-slate-300">{value}</span>
    </div>
  );
}
