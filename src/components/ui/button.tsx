"use client";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ok";
type Size = "sm" | "md";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const variants: Record<Variant, string> = {
    primary: "bg-brand-gradient text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_8px_20px_-8px_rgba(124,108,255,0.65)] hover:brightness-110",
    secondary: "bg-ink-700/80 hover:bg-ink-600 text-slate-100 ring-1 ring-inset ring-white/10",
    ghost: "hover:bg-white/[0.06] text-slate-300",
    danger: "bg-bad/90 hover:bg-bad text-white shadow-[0_8px_20px_-10px_rgba(239,68,68,0.6)]",
    ok: "bg-ok/90 hover:bg-ok text-white shadow-[0_8px_20px_-10px_rgba(16,185,129,0.6)]",
  };
  const sizes: Record<Size, string> = {
    sm: "h-9 px-3.5 text-xs",
    md: "h-10 px-4 text-sm",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
