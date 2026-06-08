"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { pushCampaignToInstantlyAction } from "@/app/(dashboard)/campaigns/actions";

export interface PickInbox { id: string; email: string; status: string; warmupScore: number; ready: boolean }

/**
 * Push a hub draft to Instantly: pick sending inboxes, create the live (draft) campaign, then land on it.
 * Shown only for drafts not yet linked to Instantly — this is what makes a hub-built campaign able to send.
 */
export function PushToInstantly({ campaignId, inboxes }: { campaignId: string; inboxes: PickInbox[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(inboxes.filter((i) => i.ready).map((i) => i.id)));
  const [busy, start] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function push() {
    if (!selected.size) return toast.error("Select at least one sending inbox.");
    start(async () => {
      const r = await pushCampaignToInstantlyAction(campaignId, [...selected]);
      if (!r.ok) return toast.error(r.error ?? "Couldn't push to Instantly.");
      toast.success(`Pushed to Instantly as a draft${r.leads ? ` · ${r.leads} lead${r.leads === 1 ? "" : "s"} carried over` : ""}. Review, then Launch to start sending.`);
      router.push(`/campaigns/${r.id}`);
    });
  }

  if (inboxes.length === 0) {
    return <p className="text-sm text-slate-400">No sending inboxes available yet — provision inboxes in Deliverability first, then push this campaign.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Pick the inboxes this campaign sends from. We&apos;ll create it in Instantly as a <span className="text-slate-200">draft</span> on the Tue–Thu schedule — it won&apos;t send until you Launch it.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {inboxes.map((i) => {
          const on = selected.has(i.id);
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => toggle(i.id)}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${on ? "border-brand-500/50 bg-brand-500/[0.06]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-200">{i.email}</p>
                <p className="text-[11px] text-slate-500">warmup {i.warmupScore}</p>
              </div>
              <Tag tone={i.ready ? "ok" : i.status === "warming" ? "warn" : "slate"}>{i.ready ? "ready" : i.status}</Tag>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={busy || !selected.size} onClick={push}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {busy ? "Pushing…" : `Push to Instantly (${selected.size})`}
        </Button>
        <span className="text-xs text-slate-500">Creates a draft — never auto-sends.</span>
      </div>
    </div>
  );
}
