"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { recordDemoOutcomeAction, sendDemoReminderAction, updateDemoAction } from "@/app/(dashboard)/pipeline/actions";
import { DEMO_LOST_REASONS, type DemoLostReason, type DemoStatus } from "@/lib/data/types";

export interface DemoRow {
  id: string;
  leadName: string;
  company: string;
  scheduledAt: string;
  status: DemoStatus;
  owner: string;
  mrr: number | null;
  outcomeReason: DemoLostReason | null;
  civDealId: string | null;
  reminderSentAt: string | null;
}

const TONE: Record<DemoStatus, "brand" | "ok" | "warn" | "bad" | "slate"> = {
  booked: "brand", showed: "ok", no_show: "warn", closed: "ok", lost: "bad",
};

const REASON_LABEL: Record<DemoLostReason, string> = {
  not_icp: "Not ICP", no_budget: "No budget", no_show: "No-show", bad_timing: "Bad timing",
  competitor: "Chose competitor", not_interested: "Not interested", no_decision: "No decision", other: "Other",
};

export function DemoTracker({ demos }: { demos: DemoRow[] }) {
  if (!demos.length) {
    return <p className="px-4 py-8 text-center text-sm text-slate-500">No demos yet — book one from a positive reply.</p>;
  }
  return <div className="divide-y divide-ink-800">{demos.map((d) => <Row key={d.id} demo={d} />)}</div>;
}

function Row({ demo }: { demo: DemoRow }) {
  const [busy, start] = useTransition();
  const [mrr, setMrr] = useState("");
  const [reason, setReason] = useState<DemoLostReason>("not_interested");
  const terminal = demo.status === "closed" || demo.status === "lost";
  const hoursUntil = (new Date(demo.scheduledAt).getTime() - Date.now()) / 3.6e6;
  const dueSoon = demo.status === "booked" && !demo.reminderSentAt && hoursUntil > -2 && hoursUntil < 36;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Could not update demo.");
      else toast.success(msg);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-100">
          {demo.leadName} <span className="text-slate-500">· {demo.company}</span>
        </p>
        <p className="text-xs text-slate-500">
          {new Date(demo.scheduledAt).toLocaleDateString()} · {demo.owner}
          {demo.mrr ? ` · $${demo.mrr}/mo` : ""}
          {demo.status === "lost" && demo.outcomeReason ? ` · ${REASON_LABEL[demo.outcomeReason]}` : ""}
          {demo.civDealId ? " · → CIQ deal" : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Tag tone={TONE[demo.status]}>{demo.status.replace("_", " ")}</Tag>
        {dueSoon && <span className="text-[11px] font-medium text-warn">soon</span>}
        {!terminal && (
          <>
            {demo.status === "booked" && (
              <>
                {demo.reminderSentAt
                  ? <span className="text-[11px] text-slate-500">reminded ✓</span>
                  : <Button size="sm" variant={dueSoon ? "primary" : "secondary"} disabled={busy} onClick={() => run(() => sendDemoReminderAction(demo.id), "Reminder sent")}>Remind</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => updateDemoAction(demo.id, "showed"), "Marked showed")}>Showed</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => updateDemoAction(demo.id, "no_show"), "Marked no-show")}>No-show</Button>
              </>
            )}
            <input
              value={mrr}
              onChange={(e) => setMrr(e.target.value)}
              inputMode="numeric"
              placeholder="MRR $"
              className="h-8 w-20 rounded-md border border-white/10 bg-ink-950 px-2 text-xs text-slate-200 focus:border-brand-500 focus:outline-none"
            />
            <Button size="sm" variant="ok" disabled={busy || !Number(mrr)} onClick={() => run(() => recordDemoOutcomeAction(demo.id, "won", undefined, Number(mrr)), `Won — $${Number(mrr)}/mo`)}>Won</Button>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as DemoLostReason)}
              disabled={busy}
              aria-label="Lost reason"
              className="h-8 rounded-md border border-white/10 bg-ink-950 px-1.5 text-xs text-slate-300 focus:border-brand-500 focus:outline-none"
            >
              {DEMO_LOST_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => recordDemoOutcomeAction(demo.id, "lost", reason), `Lost — ${REASON_LABEL[reason]}`)}>Lost</Button>
          </>
        )}
      </div>
    </div>
  );
}
