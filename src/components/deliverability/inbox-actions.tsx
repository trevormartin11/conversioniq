"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { pauseInboxAction, resumeInboxAction } from "@/app/(dashboard)/deliverability/actions";

export function InboxActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);

  function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    start(async () => {
      try {
        const r = (await fn()) as { ok?: boolean; error?: string } | undefined;
        if (r && r.ok === false) toast.error(r.error ?? "Action failed.");
        else toast.success(msg);
      } catch {
        // A thrown action used to strand busy=true forever — this button was the one
        // permanently-brickable spinner in the app.
        toast.error("That didn't go through — try again.");
      } finally {
        setBusy(false);
      }
      router.refresh();
    });
  }

  if (status === "paused") {
    return (
      <Button size="sm" variant="ok" disabled={busy} onClick={() => run(() => resumeInboxAction(id), "Inbox resumed")}>
        <Play className="h-3.5 w-3.5" /> Resume
      </Button>
    );
  }
  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => pauseInboxAction(id), "Inbox paused")}>
      <Pause className="h-3.5 w-3.5" /> Pause
    </Button>
  );
}
