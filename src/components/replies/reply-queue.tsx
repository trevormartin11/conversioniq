"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, Clock, Flame, Inbox, RefreshCw, Send, X } from "lucide-react";
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
  revertReplyAction,
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

const QUICK_REPLIES: { label: string; text: string }[] = [
  { label: "Booking link", text: "Easiest is to grab a time that works for you here: [BOOKING LINK] — looking forward to it.\n\nTrevor" },
  { label: "Ask timeline", text: "Makes sense. Rough timeline on your end — looking to sort this out this quarter, or further out?\n\nTrevor" },
  { label: "30-sec example", text: "Want me to send over a 30-second example of it handling the after-hours \"how much?\" messages? Quick to watch.\n\nTrevor" },
];

type RunOpts = { successMsg?: string; advance?: boolean; undo?: boolean };

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const visible = replies.filter((r) => {
    if (filter === "all") return true;
    if (filter === "hot") return r.hot && r.status === "pending";
    return r.status === "pending";
  });
  const visibleIds = visible.map((r) => r.id);
  const pendingCount = replies.filter((r) => r.status === "pending").length;
  const hotCount = replies.filter((r) => r.hot && r.status === "pending").length;

  const draftFor = (r: ReplyView) => drafts[r.id] ?? r.aiDraft ?? "";
  const setDraft = (id: string, val: string) => setDrafts((d) => ({ ...d, [id]: val }));

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }
  useEffect(() => autoGrow(textareaRef.current), [openId, drafts]);

  function move(delta: number) {
    if (!visibleIds.length) return;
    if (!openId) return setOpenId(visibleIds[0]);
    const i = visibleIds.indexOf(openId);
    const ni = i + delta;
    if (ni >= 0 && ni < visibleIds.length) setOpenId(visibleIds[ni]);
  }
  function nextPendingExcluding(id: string): string | null {
    const ci = visibleIds.indexOf(id);
    const stillPending = (vid: string) => replies.some((r) => r.id === vid && r.status === "pending" && r.id !== id);
    const after = visibleIds.slice(ci + 1).find(stillPending);
    if (after) return after;
    return visibleIds.find(stillPending) ?? null;
  }

  async function run(id: string, fn: () => Promise<unknown>, opts: RunOpts = {}) {
    const next = opts.advance ? nextPendingExcluding(id) : null;
    setBusyId(id);
    const res = (await fn()) as { ok?: boolean; error?: string } | undefined;
    setBusyId(null);
    if (res && res.ok === false) {
      toast.error(res.error ?? "Something went wrong.");
    } else {
      if (opts.successMsg) {
        toast.success(opts.successMsg, opts.undo ? { label: "Undo", onClick: () => startTransition(async () => { await revertReplyAction(id); router.refresh(); }) } : undefined);
      }
      if (opts.advance) setOpenId(next);
    }
    startTransition(() => router.refresh());
  }

  function approve(r: ReplyView) {
    run(r.id, () => approveAndSendAction(r.id, draftFor(r)), { successMsg: "Reply sent", advance: true });
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

  // Keyboard shortcuts: ⌘/Ctrl+Enter send · j/k move · s snooze · x skip · e edit · Esc close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "TEXTAREA" || tag === "INPUT";
      const open = openId ? visible.find((x) => x.id === openId) : null;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && open && open.status === "pending" && !NO_REPLY.includes(open.classification) && draftFor(open).trim()) {
        e.preventDefault();
        approve(open);
        return;
      }
      if (inField) return;
      if (e.key === "j") { e.preventDefault(); move(1); }
      else if (e.key === "k") { e.preventDefault(); move(-1); }
      else if (e.key === "Escape") setOpenId(null);
      else if (open && open.status === "pending") {
        if (e.key === "s") { e.preventDefault(); run(open.id, () => snoozeReplyAction(open.id), { successMsg: "Snoozed", advance: true, undo: true }); }
        else if (e.key === "x") { e.preventDefault(); run(open.id, () => skipReplyAction(open.id), { successMsg: "Skipped", advance: true, undo: true }); }
        else if (e.key === "e") { e.preventDefault(); textareaRef.current?.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, drafts, replies, filter]);

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
                <div className={cn("text-sm font-medium", active ? "text-brand-300" : "text-slate-200")}>{d.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{d.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters + shortcut hint */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = f.key === "pending" ? pendingCount : f.key === "hot" ? hotCount : replies.length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key ? "bg-brand-600 text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700",
              )}
            >
              {f.label}
              {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
            </button>
          );
        })}
        <span className="ml-auto hidden text-[11px] text-slate-600 md:inline">⌘↵ send · j/k move · s snooze · e edit</span>
        {!aiAvailable && <span className="text-[11px] text-slate-500">Drafts: rules-based (add Claude key for AI)</span>}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <Empty icon={Inbox} title="Queue is clear">New replies appear here as they arrive — classified and drafted, ready for one-tap approval.</Empty>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const open = openId === r.id;
            const noReply = NO_REPLY.includes(r.classification);
            const busy = busyId === r.id;
            const lowConf = r.confidence < 0.6;
            return (
              <div key={r.id} className={cn("card overflow-hidden transition-colors", open && "border-brand-500/40 ring-1 ring-inset ring-brand-500/20")}>
                <button onClick={() => setOpenId(open ? null : r.id)} className="flex w-full items-start gap-3 p-4 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.hot && r.status === "pending" && <Flame className="h-3.5 w-3.5 text-warn" />}
                      <span className="text-sm font-semibold text-slate-100">{r.fromName}</span>
                      <span className="truncate text-xs text-slate-500">{r.company}</span>
                      <ClassBadge cls={r.classification} />
                      {lowConf && <span className="text-[10px] text-amber-400/80" title="Low classifier confidence — double-check">~{Math.round(r.confidence * 100)}%</span>}
                      {r.status !== "pending" && <StatusBadge status={r.status} />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-400">{r.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] text-slate-500">{ago(r.receivedAt)}</span>
                    <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", open && "rotate-180")} />
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
                              run(r.id, () => suppressFromReplyAction(r.id), { successMsg: "Suppressed + added to DNC", advance: true });
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" /> Suppress + DNC
                          </Button>
                        )}
                        {r.status === "pending" && r.classification === "ooo" && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(r.id, () => snoozeReplyAction(r.id), { successMsg: "Snoozed", advance: true, undo: true })}>
                            <Clock className="h-3.5 w-3.5" /> Snooze
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        {r.status === "pending" && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {QUICK_REPLIES.map((q) => (
                              <button key={q.label} onClick={() => setDraft(r.id, q.text)} className="rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1 text-[11px] text-slate-300 hover:border-brand-500/40 hover:text-brand-300">
                                {q.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <label className="mt-2 block text-xs font-medium text-slate-400">
                          Draft reply {r.draftSource && <span className="text-slate-600">· {r.draftSource === "ai" ? "AI" : "rules"}</span>}
                        </label>
                        <textarea
                          ref={textareaRef}
                          value={draftFor(r)}
                          onChange={(e) => { setDraft(r.id, e.target.value); autoGrow(e.currentTarget); }}
                          rows={5}
                          disabled={r.status !== "pending"}
                          className="mt-1 w-full resize-none rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none disabled:opacity-60"
                        />
                        {r.status === "pending" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="primary" disabled={busy || !draftFor(r).trim()} onClick={() => approve(r)}>
                              <Send className="h-3.5 w-3.5" /> Approve & send
                            </Button>
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(r.id, async () => { const res = await regenerateDraftAction(r.id); if (res.draft) setDraft(r.id, res.draft); return res; })}>
                              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Regenerate
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(r.id, () => snoozeReplyAction(r.id), { successMsg: "Snoozed", advance: true, undo: true })}>
                              <Clock className="h-3.5 w-3.5" /> Snooze
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(r.id, () => skipReplyAction(r.id), { successMsg: "Skipped", advance: true, undo: true })}>
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
