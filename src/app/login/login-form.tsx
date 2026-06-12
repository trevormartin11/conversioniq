"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";
import { safeNextPath } from "@/lib/session";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await loginAction(password);
      if (!res.ok) {
        setError(res.error ?? "Login failed.");
        return;
      }
      router.replace(safeNextPath(next)); // never an off-origin target (open-redirect phishing)
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h1 className="text-lg font-semibold text-slate-100">CIQ Hub</h1>
      <p className="mt-0.5 text-sm text-slate-500">Enter the team password to continue.</p>
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
