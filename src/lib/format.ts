import { formatDistanceToNowStrict } from "date-fns";

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** "3m ago", "2h ago" — for reply/inbox recency. */
export function ago(iso: string | null): string {
  if (!iso) return "—";
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return "—";
  }
}

/** Safe division that returns 0 instead of NaN/Infinity. */
export function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
