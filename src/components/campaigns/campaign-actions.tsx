"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Loader2, Pause, Play, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cloneCampaignAction, deleteCampaignAction, launchCampaignAction, launchChecklistAction, pauseCampaignAction } from "@/app/(dashboard)/campaigns/actions";
import type { ChecklistItem } from "@/lib/campaigns/launch-checklist";

export function CampaignActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [warmupWarn, setWarmupWarn] = useState<string | null>(null);
  // The pre-launch checklist: the FINAL gate. null = closed.
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  function run(key: string, fn: () => Promise<unknown>, successMsg?: string) {
    setBusy(key);
    start(async () => {
      try {
        const res = (await fn()) as { ok?: boolean; error?: string; blocked?: string; id?: string } | undefined;
        if (res && res.ok === false && res.blocked === "warmup") {
          setWarmupWarn(res.error ?? "Some assigned inboxes are under warmup."); // keep UI open, offer override
          return;
        }
        setChecklist(null);
        setTicked(new Set());
        setWarmupWarn(null);
        if (res && res.ok === false) toast.error(res.error ?? "Something went wrong.");
        else if (key === "clone" && res?.id) {
          // Give the operator a path to the clone — it used to be findable only by scanning /campaigns.
          const cloneId = res.id;
          toast.success("Campaign cloned", { label: "Open clone →", onClick: () => router.push(`/campaigns/${cloneId}`) });
        } else if (successMsg) toast.success(successMsg);
      } catch {
        toast.error("That didn't go through — check your connection and try again.");
      } finally {
        setBusy(null);
      }
      router.refresh();
    });
  }

  async function openChecklist() {
    setChecklistLoading(true);
    try {
      const r = await launchChecklistAction(id);
      if (!r.ok) return toast.error(r.error ?? "Couldn't load the checklist.");
      setChecklist(r.items);
      setTicked(new Set());
    } catch {
      toast.error("Couldn't load the launch checklist — try again.");
    } finally {
      setChecklistLoading(false);
    }
  }

  function remove() {
    setBusy("delete");
    start(async () => {
      const res = await deleteCampaignAction(id);
      if (res.ok === false) {
        setBusy(null);
        setConfirmDelete(false);
        return toast.error(res.error ?? "Couldn't delete campaign.");
      }
      toast.success("Campaign deleted");
      router.replace("/campaigns"); // the detail page would 404 now that it's gone
      router.refresh();
    });
  }

  const hasFail = checklist?.some((i) => i.status === "fail") ?? false;
  const manualPending = checklist?.filter((i) => i.manual && !ticked.has(i.key)).length ?? 0;
  const launchReady = !!checklist && !hasFail && manualPending === 0;

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
            <Button size="sm" variant="ghost" onClick={() => { setWarmupWarn(null); setChecklist(null); }}>Cancel</Button>
          </span>
        ) : (
          !checklist && (
            <Button size="sm" variant="ghost" disabled={!!busy || checklistLoading} onClick={openChecklist}>
              {checklistLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Launch
            </Button>
          )
        )}
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run("clone", () => cloneCampaignAction(id), "Campaign cloned")}>
          <Copy className="h-3.5 w-3.5" /> Clone
        </Button>
        {confirmDelete ? (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="danger" disabled={!!busy} onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" /> Confirm delete
            </Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>

      {checklist && !warmupWarn && (
        <div className="mt-1 space-y-2 rounded-xl border border-ink-700 bg-ink-900/60 p-4">
          <p className="text-sm font-semibold text-slate-100">Final pre-launch checklist</p>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <div key={item.key} className="flex items-start gap-2 text-xs">
                {item.manual ? (
                  <input
                    type="checkbox"
                    checked={ticked.has(item.key)}
                    onChange={(e) => {
                      const next = new Set(ticked);
                      if (e.target.checked) next.add(item.key);
                      else next.delete(item.key);
                      setTicked(next);
                    }}
                    className="mt-0.5 accent-brand-500"
                  />
                ) : item.status === "pass" ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
                ) : item.status === "warn" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" />
                )}
                <div className="min-w-0">
                  <p className={item.status === "fail" ? "text-red-300" : "text-slate-200"}>{item.label}</p>
                  {item.detail && <p className="text-[11px] text-slate-500">{item.detail}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="ok" disabled={!!busy || !launchReady} onClick={() => run("launch", () => launchCampaignAction(id), "Campaign launched")}>
              <Play className="h-3.5 w-3.5" /> Launch — starts sending
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setChecklist(null); setTicked(new Set()); }}>Cancel</Button>
            {!launchReady && (
              <span className="text-[11px] text-slate-500">
                {hasFail ? "Fix the blocking items first." : `Tick ${manualPending} sign-off${manualPending === 1 ? "" : "s"} to enable launch.`}
              </span>
            )}
          </div>
        </div>
      )}
      {confirmDelete && <p className="text-xs text-slate-400">Permanently removes this campaign and its sequence — and the linked Instantly campaign, if any. This can&apos;t be undone.</p>}
      {warmupWarn && <p className="text-xs text-amber-300">⚠ {warmupWarn}</p>}
    </div>
  );
}
