import { cn } from "@/lib/utils";

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "ok" | "warn" | "bad" }) {
  const bar = { brand: "bg-brand-500", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

/** Inline trend line with gradient area fill, end-point dot, and trend coloring. */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const w = 240;
  const h = 48;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (d: number) => h - pad - ((d - min) / span) * (h - pad * 2);
  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d).toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const up = data[data.length - 1] >= data[0];
  const gid = `spark_${Math.round(min)}_${Math.round(max)}_${data.length}_${up ? "u" : "d"}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-12 w-full", up ? "text-ok" : "text-bad", className)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2.5" fill="currentColor" />
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
