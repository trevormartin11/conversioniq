"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loginAction } from "./actions";

const PARTNERS = [
  { id: "u_trevor", name: "Trevor", color: "#6366f1" },
  { id: "u_jon", name: "Jon", color: "#10b981" },
  { id: "u_brian", name: "Brian", color: "#f59e0b" },
];

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState(PARTNERS[0].id);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await loginAction(password, userId);
      if (!res.ok) {
        setError(res.error ?? "Login failed.");
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h1 className="text-lg font-semibold text-slate-100">Sign in</h1>
      <p className="mt-0.5 text-sm text-slate-500">Who&apos;s signing in?</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {PARTNERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setUserId(p.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors",
              userId === p.id ? "border-brand-500 bg-brand-600/15 text-slate-100" : "border-ink-700 bg-ink-850 text-slate-400 hover:border-ink-600",
            )}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: p.color }}>
              {p.name[0]}
            </span>
            {p.name}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-xs font-medium text-slate-400">Team password</label>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
      />
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      <Button type="submit" variant="primary" className="mt-4 w-full" disabled={pending || !password}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
