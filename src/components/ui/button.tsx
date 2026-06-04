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
    primary: "bg-brand-600 hover:bg-brand-500 text-white",
    secondary: "bg-ink-700 hover:bg-ink-600 text-slate-100",
    ghost: "hover:bg-ink-700 text-slate-300",
    danger: "bg-bad/90 hover:bg-bad text-white",
    ok: "bg-ok/90 hover:bg-ok text-white",
  };
  const sizes: Record<Size, string> = {
    sm: "h-9 px-3.5 text-xs",
    md: "h-10 px-4 text-sm",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
