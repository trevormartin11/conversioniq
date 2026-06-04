"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, Clock, Flame, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassBadge, StatusBadge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { ago } from "@/lib/format";
import type { AutomationLevel, ReplyClass, ReplyStatus } from "@/lib/data/types";
import {
  approveAndSendAction,
  regenerateDraftAction,
  setAutomationAction,
  skipReplyAction,
  snoozeReplyAction,
  suppressFromReplyAction,
} from "@/app/(dashboard)/replies/actions";

export interface ReplyView {
  id: string;
  leadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
  classification: ReplyClass;
  confidence: number;
  aiDraft: string | null;
  draftSource: "ai" | "rules" | null;
  status: ReplyStatus;
  hot: boolean;
  company: string;
  vertical: string;
}

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "hot", label: "Hot" },
  { key: "all", label: "All" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const DIAL: { level: AutomationLevel; label: string; desc: string }[] = [
  { level: "approve_all", label: "Approve all", desc: "You approve every reply before it sends." },
  { level: "auto_safe", label: "Auto-send safe", desc: "Auto-send referrals; auto-snooze OOO; you approve the rest." },
  { level: "auto_all", label: "Mostly auto", desc: "AI sends confident replies on its own; you're notified. Negatives/unsubscribes always suppressed." },
];
const RANK: Record<AutomationLevel, number> = { approve_all: 0, auto_safe: 1, auto_all: 2 };

const NO_REPLY: ReplyClass[] = ["unsubscribe", "negative", "ooo"];

export function ReplyQueue({
  replies,
  automationLevel,
  aiAvailable,
}: {
  replies: ReplyView[];
  automationLevel: AutomationLevel;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [levelPending, setLevelPending] = useState<AutomationLevel | null>(null);

  const visible = replies.filter((r) => {
    if (filter === "all") return true;
    if (filter === "hot") return r.hot && r.status === "pending";
    return r.status === "pending";
  });
  const pendingCount = replies.filter((r) => r.status === "pending").length;

  function draftFor(r: ReplyView) {
    return drafts[r.id] ?? r.aiDraft ?? "";
  }

  async function run(id: string, fn: () => Promise<unknown>, successMsg?: string) {
    setBusyId(id);
    const res = (await fn()) as { ok?: boolean; error?: string } | undefined;
    setBusyId(null);
    if (res && res.ok === false) toast.error(res.error ?? "Something went wrong.");
    else if (successMsg) toast.success(successMsg);
    startTransition(() => router.refresh());
  }

  function changeLevel(level: AutomationLevel) {
    const current = levelPending ?? automationLevel;
    if (level === current) return;
    if (RANK[level] > RANK[current] && typeof window !== "undefined") {
      const msg =
        level === "auto_all"
          ? "Switch to Mostly auto? The AI will start sending confident replies (interested/question/objection) without your review."
          : "Switch to Auto-send safe? Referrals will be sent automatically; you still approve everything else.";
      if (!window.confirm(msg)) return;
    }
    setLevelPending(level);
    startTransition(async () => {
      const res = (await setAutomationAction(level)) as { ok?: boolean } | undefined;
      setLevelPending(null);
      if (res?.ok === false) toast.error("Couldn't change automation level.");
      else toast.success(`Automation: ${DIAL.find((d) => d.level === level)?.label}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Automation dial */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Automation level</h2>
            <p className="text-xs text-slate-500">Move the dial up as you build trust. Negatives & unsubscribes are always auto-suppressed.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {DIAL.map((d) => {
            const active = (levelPending ?? automationLevel) === d.level;
            return (
              <button
                key={d.level}
                onClick={() => changeLevel(d.level)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  active ? "border-brand-500 bg-brand-600/15" : "border-ink-700 bg-ink-850 hover:border-ink-600",
                )}
              >
                <div className={cn("text-sm font-medium", active ? "text-brand-400" : "text-slate-200")}>{d.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{d.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key ? "bg-brand-600 text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700",
            )}
          >
            {f.label}
            {f.key === "pending" && pendingCount > 0 && <span className="ml-1 opacity-70">({pendingCount})</span>}
          </button>
        ))}
        {!aiAvailable && (
          <span className="ml-auto text-[11px] text-slate-500">Drafts: rules-based (add Claude key for AI)</span>
        )}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <Empty>Nothing here — queue is clear. 🎉</Empty>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const open = openId === r.id;
            const noReply = NO_REPLY.includes(r.classification);
            const busy = busyId === r.id;
            return (
              <div key={r.id} className={cn("card overflow-hidden transition-colors", open && "border-ink-600")}>
                <button onClick={() => setOpenId(open ? null : r.id)} className="flex w-full items-start gap-3 p-4 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.hot && r.status === "pending" && <Flame className="h-3.5 w-3.5 text-warn" />}
                      <span className="text-sm font-semibold text-slate-100">{r.fromName}</span>
                      <span className="truncate text-xs text-slate-500">{r.company}</span>
                      <ClassBadge cls={r.classification} />
                      {r.status !== "pending" && <StatusBadge status={r.status} />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-400">{r.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] text-slate-500">{ago(r.receivedAt)}</span>
                    <ChevronDown className={cn("h-4 w-4 text-slate-600 transition-transform", open && "rotate-180")} />
                  </div>
                </button>

                {open && (
                  <div className="border-t border-ink-700 bg-ink-900/40 p-4">
                    <div className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-sm text-slate-300">
                      <p className="mb-1 text-xs text-slate-500">{r.fromEmail} · {r.vertical} · classifier {(r.confidence * 100).toFixed(0)}%</p>
                      {r.body}
                    </div>

                    {noReply ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-400">
                          {r.classification === "ooo"
                            ? "Out-of-office — no reply needed; lead will be re-queued."
                            : "Negative/unsubscribe — auto-suppress + flag Zoho DNC."}
                        </span>
                        {r.status === "pending" && r.classification !== "ooo" && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                              if (typeof window !== "undefined" && !window.confirm(`Suppress ${r.fromName} and add to Do-Not-Contact? This can't be undone here.`)) return;
                              run(r.id, () => suppressFromReplyAction(r.id), "Suppressed + added to DNC");
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" /> Suppress + DNC
                          </Button>
                        )}
                        {r.status === "pending" && r.classification === "ooo" && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(r.id, () => snoozeReplyAction(r.id))}>
                            <Clock className="h-3.5 w-3.5" /> Snooze
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        <label className="mt-3 block text-xs font-medium text-slate-400">
                          Draft reply {r.draftSource && <span className="text-slate-600">· {r.draftSource === "ai" ? "AI" : "rules"}</span>}
                        </label>
                        <textarea
                          value={draftFor(r)}
                          onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                          rows={5}
                          disabled={r.status !== "pending"}
                          className="mt-1 w-full resize-y rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none disabled:opacity-60"
                        />
                        {r.status === "pending" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="primary" disabled={busy || !draftFor(r).trim()} onClick={() => run(r.id, () => approveAndSendAction(r.id, draftFor(r)), "Reply sent")}>
                              <Send className="h-3.5 w-3.5" /> Approve & send
                            </Button>
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(r.id, async () => { const res = await regenerateDraftAction(r.id); if (res.draft) setDrafts((d) => ({ ...d, [r.id]: res.draft })); })}>
                              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Regenerate
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(r.id, () => snoozeReplyAction(r.id))}>
                              <Clock className="h-3.5 w-3.5" /> Snooze
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(r.id, () => skipReplyAction(r.id))}>
                              <X className="h-3.5 w-3.5" /> Skip
                            </Button>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">Handled — {r.status}.</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
