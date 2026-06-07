"use client";

import { useState } from "react";
import { Check, Clock, Loader2, UploadCloud } from "lucide-react";
import { applyOptimalScheduleAction, pushCopyToInstantlyAction } from "@/app/(dashboard)/campaigns/push-actions";

/**
 * Push hub edits to the LIVE Instantly campaign — copy (cadence preserved) and the optimal
 * send window. Gated to an explicit click; failures surface verbatim (never faked).
 */
export function InstantlySync({ campaignId }: { campaignId: string }) {
  const [pending, setPending] = useState<"" | "copy" | "schedule">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pushCopy() {
    setPending("copy");
    setMsg(null);
    const r = await pushCopyToInstantlyAction(campaignId);
    setMsg(r.ok ? { ok: true, text: "Copy pushed to the live Instantly sequence." } : { ok: false, text: r.error ?? "Failed." });
    setPending("");
  }
  async function applySchedule() {
    setPending("schedule");
    setMsg(null);
    const r = await applyOptimalScheduleAction(campaignId);
    setMsg(r.ok ? { ok: true, text: `Optimal window applied${r.timezone ? ` (${r.timezone})` : ""}.` } : { ok: false, text: r.error ?? "Failed." });
    setPending("");
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-ink-600 disabled:opacity-50";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={pushCopy} disabled={!!pending} className={btn}>
          {pending === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4 text-brand-400" />}
          Push copy to Instantly
        </button>
        <button onClick={applySchedule} disabled={!!pending} className={btn}>
          {pending === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4 text-brand-400" />}
          Apply optimal send window
        </button>
      </div>
      {msg && (
        <p className={`inline-flex items-center gap-1 text-[11px] ${msg.ok ? "text-ok" : "text-red-300"}`}>
          {msg.ok && <Check className="h-3 w-3" />}
          {msg.text}
        </p>
      )}
      <p className="text-[11px] text-slate-500">Beta — writes to your live Instantly campaign. Try it on one campaign first.</p>
    </div>
  );
}
