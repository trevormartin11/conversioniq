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
      const r = (await fn()) as { ok?: boolean } | undefined;
      setBusy(false);
      if (r && r.ok === false) toast.error("Action failed.");
      else toast.success(msg);
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
