import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";
import type { Health, ReplyClass, ReplyStatus } from "@/lib/data/types";

const HEALTH_STYLES: Record<Health, string> = {
  green: "bg-ok/15 text-emerald-300 ring-1 ring-inset ring-ok/25",
  yellow: "bg-warn/15 text-amber-300 ring-1 ring-inset ring-warn/25",
  red: "bg-bad/15 text-red-300 ring-1 ring-inset ring-bad/25",
};
const HEALTH_DOT: Record<Health, string> = { green: "bg-ok", yellow: "bg-warn", red: "bg-bad" };

export function HealthDot({ health, pulse }: { health: Health; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && health !== "green" && (
        <span className={cn("absolute inline-flex h-full w-full animate-pulse-soft rounded-full opacity-75", HEALTH_DOT[health])} />
      )}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", HEALTH_DOT[health])} />
    </span>
  );
}

export function HealthBadge({ health, label }: { health: Health; label?: string }) {
  return (
    <span className={cn("chip", HEALTH_STYLES[health])}>
      <HealthDot health={health} />
      {label ?? titleCase(health)}
    </span>
  );
}

const CLASS_STYLES: Record<ReplyClass, string> = {
  interested: "bg-ok/15 text-emerald-300 ring-1 ring-inset ring-ok/25",
  question: "bg-brand/15 text-brand-300 ring-1 ring-inset ring-brand-500/25",
  objection: "bg-warn/15 text-amber-300 ring-1 ring-inset ring-warn/25",
  not_now: "bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-400/20",
  negative: "bg-bad/15 text-red-300 ring-1 ring-inset ring-bad/25",
  unsubscribe: "bg-bad/15 text-red-300 ring-1 ring-inset ring-bad/25",
  ooo: "bg-slate-500/15 text-slate-400 ring-1 ring-inset ring-slate-400/20",
  referral: "bg-brand/15 text-brand-300 ring-1 ring-inset ring-brand-500/25",
};

export function ClassBadge({ cls }: { cls: ReplyClass }) {
  return <span className={cn("chip", CLASS_STYLES[cls])}>{titleCase(cls)}</span>;
}

const STATUS_STYLES: Partial<Record<ReplyStatus, string>> = {
  pending: "bg-warn/15 text-amber-300 ring-1 ring-inset ring-warn/25",
  approved: "bg-brand/15 text-brand-300 ring-1 ring-inset ring-brand-500/25",
  sent: "bg-ok/15 text-emerald-300 ring-1 ring-inset ring-ok/25",
  auto_sent: "bg-ok/15 text-emerald-300 ring-1 ring-inset ring-ok/25",
  suppressed: "bg-bad/15 text-red-300 ring-1 ring-inset ring-bad/25",
  snoozed: "bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-400/20",
  skipped: "bg-slate-500/15 text-slate-400 ring-1 ring-inset ring-slate-400/20",
};

export function StatusBadge({ status }: { status: ReplyStatus }) {
  return <span className={cn("chip", STATUS_STYLES[status] ?? "bg-slate-500/15 text-slate-300")}>{titleCase(status)}</span>;
}

export function Tag({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "brand" | "ok" | "warn" | "bad" }) {
  const styles = {
    slate: "bg-ink-700/60 text-slate-300 ring-1 ring-inset ring-white/10",
    brand: "bg-brand/15 text-brand-300 ring-1 ring-inset ring-brand-500/25",
    ok: "bg-ok/15 text-emerald-300 ring-1 ring-inset ring-ok/25",
    warn: "bg-warn/15 text-amber-300 ring-1 ring-inset ring-warn/25",
    bad: "bg-bad/15 text-red-300 ring-1 ring-inset ring-bad/25",
  }[tone];
  return <span className={cn("chip", styles)}>{children}</span>;
}
