"use client";

import { useState, useTransition } from "react";
import { Loader2, Zap } from "lucide-react";
import { Tag } from "@/components/ui/badge";
import { testConnectionsAction } from "@/app/(dashboard)/settings/actions";
import type { ConnResult } from "@/lib/integrations/healthcheck";

export interface IntegrationItem {
  key: string;
  label: string;
  role: string;
  note?: string;
  connected: boolean;
}

/**
 * Renders the integration grid and, on demand, runs a live read-only probe of every
 * configured provider so the operator can see which keys actually work — not just which
 * are present. Calls the secret-free server action (gated by the app login).
 */
export function ConnectionTester({ items }: { items: IntegrationItem[] }) {
  const [results, setResults] = useState<Record<string, ConnResult>>({});
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await testConnectionsAction();
      setResults(Object.fromEntries(res.map((r) => [r.key, r])));
      setRanAt(new Date().toLocaleTimeString());
    });
  }

  const tested = Object.values(results);
  const liveCount = tested.filter((r) => r.ok === true).length;
  const failCount = tested.filter((r) => r.ok === false).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={run}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-ink-600 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-brand-400" />}
          {pending ? "Testing live connections…" : "Test live connections"}
        </button>
        {ranAt && (
          <span className="text-xs text-slate-500">
            {liveCount} live{failCount ? ` · ${failCount} failing` : ""} · ran {ranAt}
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((s) => {
          const r = results[s.key];
          return (
            <div key={s.key} className="card flex items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-200">{s.label}</p>
                <p className="text-xs text-slate-500">{s.role}</p>
                {r?.ok === false && <p className="mt-0.5 break-words text-[11px] text-red-300">{r.detail}</p>}
                {r?.ok === true && (
                  <p className="mt-0.5 text-[11px] text-ok">
                    {r.detail}
                    {r.ms != null ? ` · ${r.ms}ms` : ""}
                  </p>
                )}
                {r && r.ok === null && r.configured && <p className="mt-0.5 text-[11px] text-slate-500">{r.detail}</p>}
                {!r && s.note && <p className="mt-0.5 text-[11px] text-warn">{s.note}</p>}
              </div>
              <StatusTag item={s} result={r} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusTag({ item, result }: { item: IntegrationItem; result?: ConnResult }) {
  if (!result) return <Tag tone={item.connected ? "ok" : "slate"}>{item.connected ? "On" : "Off"}</Tag>;
  if (result.ok === true) return <Tag tone="ok">Live</Tag>;
  if (result.ok === false) return <Tag tone="bad">Fail</Tag>;
  return <Tag tone="slate">{result.configured ? "Set" : "Off"}</Tag>;
}
