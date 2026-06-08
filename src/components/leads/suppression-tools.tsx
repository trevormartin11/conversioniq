"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, ShieldCheck, ShieldX, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { titleCase } from "@/lib/format";
import { checkTouchedAction, dedupeListAction } from "@/app/(dashboard)/leads/actions";

type CheckResult = Awaited<ReturnType<typeof checkTouchedAction>>;
type DedupeResult = Awaited<ReturnType<typeof dedupeListAction>>;

export function SuppressionTools({ initialCheck }: { initialCheck?: string }) {
  const [pending, startTransition] = useTransition();

  // --- touch checker ---
  const [q, setQ] = useState(initialCheck ?? "");
  const [result, setResult] = useState<CheckResult | null>(null);
  function runCheck(value: string) {
    startTransition(async () => {
      try {
        setResult(await checkTouchedAction(value));
      } catch {
        toast.error("Couldn't run the check — try again.");
      }
    });
  }
  function check() {
    runCheck(q);
  }
  useEffect(() => {
    if (initialCheck) runCheck(initialCheck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCheck]);

  // --- list dedupe ---
  const [list, setList] = useState("");
  const [dedupe, setDedupe] = useState<DedupeResult | null>(null);
  function runDedupe() {
    startTransition(async () => {
      try {
        setDedupe(await dedupeListAction(list));
      } catch {
        toast.error("Couldn't dedupe the list — try again.");
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Touch checker */}
      <div className="card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Search className="h-4 w-4 text-brand-400" /> Have we touched this?
        </h3>
        <p className="text-xs text-slate-500">Check any email or domain against the entire contacted + DNC universe.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            placeholder="email@company.com or company.com"
            className="h-10 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
          />
          <Button variant="primary" disabled={pending || !q.trim()} onClick={check}>Check</Button>
        </div>
        {result?.ok && (
          <div className="mt-3 space-y-2">
            <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${result.suppressed ? "bg-bad/10 text-bad" : "bg-ok/10 text-ok"}`}>
              {result.suppressed ? <ShieldX className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {result.suppressed ? `Suppressed — ${titleCase(result.reason ?? "on list")}. Do not contact.` : "Clear — not in the suppression universe."}
            </div>
            {result.leadMatches.length > 0 && (
              <div className="rounded-lg border border-ink-700 p-2 text-xs">
                <p className="mb-1 text-slate-500">{result.leadMatches.length} matching lead(s):</p>
                {result.leadMatches.map((l) => (
                  <div key={l.email} className="flex items-center justify-between py-0.5">
                    <span className="text-slate-300">{l.name} · {l.company}</span>
                    <Tag tone="slate">{titleCase(l.status)}</Tag>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* List dedupe */}
      <div className="card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Upload className="h-4 w-4 text-brand-400" /> Dedupe a new list
        </h3>
        <p className="text-xs text-slate-500">Paste emails (one per line). We strip anyone already contacted, on DNC, bounced, or unsubscribed — before they enter a campaign.</p>
        <textarea
          value={list}
          onChange={(e) => setList(e.target.value)}
          rows={4}
          placeholder={"sarah@radiancemedspa.com\nowner@elitelaserspa.com\n…"}
          className="mt-3 w-full resize-y rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button variant="primary" disabled={pending || !list.trim()} onClick={runDedupe}>Dedupe</Button>
          {dedupe?.ok && (
            <span className="text-xs text-slate-400">
              <span className="font-medium text-ok">{dedupe.cleanCount} clean</span> · <span className="text-bad">{dedupe.total - dedupe.cleanCount} removed</span> of {dedupe.total}
            </span>
          )}
        </div>
        {dedupe?.ok && dedupe.rejected.length > 0 && (
          <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-ink-700 p-2 text-xs">
            {dedupe.rejected.map((r) => (
              <div key={r.email} className="flex items-center justify-between py-0.5">
                <span className="truncate text-slate-400">{r.email}</span>
                <Tag tone="bad">{r.reason}</Tag>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
