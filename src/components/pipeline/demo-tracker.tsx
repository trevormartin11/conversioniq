"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { updateDemoAction } from "@/app/(dashboard)/pipeline/actions";
import type { DemoStatus } from "@/lib/data/types";

export interface DemoRow {
  id: string;
  leadName: string;
  company: string;
  scheduledAt: string;
  status: DemoStatus;
  owner: string;
  mrr: number | null;
}

const TONE: Record<DemoStatus, "brand" | "ok" | "warn" | "bad" | "slate"> = {
  booked: "brand", showed: "ok", no_show: "warn", closed: "ok", lost: "bad",
};

export function DemoTracker({ demos }: { demos: DemoRow[] }) {
  if (!demos.length) {
    return <p className="px-4 py-8 text-center text-sm text-slate-500">No demos yet — book one from a positive reply.</p>;
  }
  return (
    <div className="divide-y divide-ink-800">
      {demos.map((d) => <Row key={d.id} demo={d} />)}
    </div>
  );
}

function Row({ demo }: { demo: DemoRow }) {
  const [busy, start] = useTransition();
  const [mrr, setMrr] = useState("");
  const terminal = demo.status === "closed" || demo.status === "lost";

  function act(status: DemoStatus, mrrVal?: number) {
    start(async () => {
      const r = await updateDemoAction(demo.id, status, mrrVal);
      if (!r.ok) toast.error(r.error ?? "Could not update demo.");
      else if (status === "closed") toast.success(`Closed ${demo.company} — $${mrrVal}/mo`);
      else toast.success(`Marked ${status.replace("_", " ")}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-100">
          {demo.leadName} <span className="text-slate-500">· {demo.company}</span>
        </p>
        <p className="text-xs text-slate-500">
          {new Date(demo.scheduledAt).toLocaleDateString()} · {demo.owner}{demo.mrr ? ` · $${demo.mrr}/mo` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Tag tone={TONE[demo.status]}>{demo.status.replace("_", " ")}</Tag>
        {!terminal && (
          <>
            {demo.status === "booked" && (
              <>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("showed")}>Showed</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("no_show")}>No-show</Button>
              </>
            )}
            <input
              value={mrr}
              onChange={(e) => setMrr(e.target.value)}
              inputMode="numeric"
              placeholder="MRR $"
              className="h-8 w-20 rounded-md border border-white/10 bg-ink-950 px-2 text-xs text-slate-200 focus:border-brand-500 focus:outline-none"
            />
            <Button size="sm" variant="ok" disabled={busy || !Number(mrr)} onClick={() => act("closed", Number(mrr))}>Close</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("lost")}>Lost</Button>
          </>
        )}
      </div>
    </div>
  );
}
