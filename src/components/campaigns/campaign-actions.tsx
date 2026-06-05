"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cloneCampaignAction, launchCampaignAction, pauseCampaignAction } from "@/app/(dashboard)/campaigns/actions";

export function CampaignActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const [warmupWarn, setWarmupWarn] = useState<string | null>(null);

  function run(key: string, fn: () => Promise<unknown>, successMsg?: string) {
    setBusy(key);
    start(async () => {
      const res = (await fn()) as { ok?: boolean; error?: string; blocked?: string } | undefined;
      setBusy(null);
      if (res && res.ok === false && res.blocked === "warmup") {
        setWarmupWarn(res.error ?? "Some assigned inboxes are under warmup."); // keep UI open, offer override
        return;
      }
      setConfirmLaunch(false);
      setWarmupWarn(null);
      if (res && res.ok === false) toast.error(res.error ?? "Something went wrong.");
      else if (successMsg) toast.success(successMsg);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {status === "active" ? (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run("pause", () => pauseCampaignAction(id), "Campaign paused")}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </Button>
        ) : warmupWarn ? (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run("launch", () => launchCampaignAction(id, true), "Campaign launched")}>
              Launch anyway
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setWarmupWarn(null); setConfirmLaunch(false); }}>Cancel</Button>
          </span>
        ) : confirmLaunch ? (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ok" disabled={!!busy} onClick={() => run("launch", () => launchCampaignAction(id), "Campaign launched")}>
              Confirm launch — starts sending
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmLaunch(false)}>Cancel</Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmLaunch(true)}>
            <Play className="h-3.5 w-3.5" /> Launch
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run("clone", () => cloneCampaignAction(id), "Campaign cloned")}>
          <Copy className="h-3.5 w-3.5" /> Clone
        </Button>
      </div>
      {warmupWarn && <p className="text-xs text-amber-300">⚠ {warmupWarn}</p>}
    </div>
  );
}
