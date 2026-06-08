"use client";

import { useTransition } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { normalizeAllSchedulesAction } from "@/app/(dashboard)/campaigns/push-actions";

/** One-click: bring every live campaign onto the standard Tue–Thu schedule + optimal window. */
export function NormalizeSchedules() {
  const [busy, start] = useTransition();
  function run() {
    start(async () => {
      const r = await normalizeAllSchedulesAction();
      if (r.applied === 0) return toast.error(r.results[0]?.error ?? "No live campaigns to update.");
      toast.success(`Tue–Thu applied to ${r.applied} campaign${r.applied === 1 ? "" : "s"}${r.failed ? ` · ${r.failed} failed` : ""}.`);
    });
  }
  return (
    <Button size="sm" variant="secondary" disabled={busy} onClick={run}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4 text-brand-400" />} Apply Tue–Thu to all live campaigns
    </Button>
  );
}
