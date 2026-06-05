"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Rocket, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createCampaignFromDraftAction, generateSequenceAction, proposeVerticalsAction } from "@/app/(dashboard)/copy/actions";
import type { GeneratedStep } from "@/lib/ai/copy";
import type { VerticalIdea } from "@/lib/ai/strategy";

export type InboxOpt = { email: string; warmup: number; status: string };

export function StrategyStudio({ aiOn, inboxes }: { aiOn: boolean; inboxes: InboxOpt[] }) {
  const [ideas, setIdeas] = useState<VerticalIdea[]>([]);
  const [loadingIdeas, startIdeas] = useTransition();
  const [vertical, setVertical] = useState("");
  const [activeBrief, setActiveBrief] = useState<string | null>(null);
  const [steps, setSteps] = useState<GeneratedStep[]>([]);
  const [source, setSource] = useState<"ai" | "rules" | null>(null);
  const [drafting, startDraft] = useTransition();

  // launcher
  const [name, setName] = useState("");
  const [cap, setCap] = useState(100);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [creating, startCreate] = useTransition();
  const [created, setCreated] = useState<string | null>(null);

  function suggest() {
    startIdeas(async () => setIdeas(await proposeVerticalsAction()));
  }
  function draft(v: string, brief?: string) {
    setVertical(v);
    setActiveBrief(brief ?? null);
    setCreated(null);
    setConfirm(false);
    startDraft(async () => {
      const r = await generateSequenceAction(v, brief);
      setSteps(r.steps);
      setSource(r.source);
    });
  }
  function toggle(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }
  function selectWarmed() {
    setSelected(new Set(inboxes.filter((i) => i.status === "active").map((i) => i.email)));
  }
  function create() {
    setConfirm(false);
    startCreate(async () => {
      const r = await createCampaignFromDraftAction({
        name: name || `CIQ ${vertical}`,
        vertical,
        steps: steps.map((s) => ({ subject: s.subject, body: s.body })),
        inboxEmails: [...selected],
        dailyCap: Number(cap) || 100,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Could not create the campaign.");
        return;
      }
      setCreated(r.id);
      toast.success("Draft campaign created in Instantly.");
    });
  }

  return (
    <div className="space-y-3">
      {/* 1 — strategy */}
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">1 · Where to point the fleet</p>
              <p className="mt-0.5 text-xs text-slate-500">AI proposes verticals scored on ConversionIQ fit, each with the angle to lead with.</p>
            </div>
            <Button size="sm" variant="primary" onClick={suggest} disabled={loadingIdeas}>
              <Wand2 className="h-4 w-4" /> {loadingIdeas ? "Thinking…" : "Suggest verticals"}
            </Button>
          </div>
          {ideas.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ideas.map((idea, i) => (
                <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">{idea.vertical}</span>
                    <Tag tone={idea.fit >= 8 ? "ok" : idea.fit >= 6 ? "brand" : "slate"}>fit {idea.fit}/10</Tag>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{idea.why}</p>
                  <p className="mt-1 text-xs italic text-slate-500">Angle: {idea.angle}</p>
                  <button
                    onClick={() => draft(idea.vertical, `${idea.angle} (${idea.why})`)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-300 transition-colors hover:text-brand-200"
                  >
                    Draft copy for this <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 2 — copy */}
      <Card>
        <CardBody>
          <p className="text-sm font-semibold text-slate-100">2 · Draft the sequence</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="min-w-[160px] flex-1">
              <label className="block text-xs font-medium text-slate-400">Vertical</label>
              <input
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                placeholder="e.g. Med Spas — or pick one above"
                className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <Button variant="primary" onClick={() => draft(vertical, activeBrief ?? undefined)} disabled={drafting || !vertical.trim()}>
              <Sparkles className="h-4 w-4" /> {drafting ? "Drafting…" : "Draft sequence"}
            </Button>
          </div>
          {source && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tag tone={source === "ai" ? "brand" : "slate"}>{source === "ai" ? "Claude-generated" : "templated"}</Tag>
              {activeBrief && <span className="text-[11px] text-slate-500">grounded in: {activeBrief}</span>}
            </div>
          )}
          <div className="mt-3 space-y-3">
            {steps.map((s) => (
              <div key={s.step} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-300">Step {s.step}</span>
                <p className="mt-1 text-sm font-semibold text-slate-100">{s.subject}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-400">{s.body}</p>
                {s.rationale && <p className="mt-1.5 text-[11px] italic text-slate-500">Why: {s.rationale}</p>}
              </div>
            ))}
          </div>
          {!aiOn && <p className="mt-2 text-[11px] text-slate-500">Add a Claude key for AI drafts (templated otherwise).</p>}
        </CardBody>
      </Card>

      {/* 3 — launch */}
      {steps.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-brand-300" />
              <p className="text-sm font-semibold text-slate-100">3 · Launch setup</p>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">Creates a <span className="text-slate-300">draft</span> campaign in Instantly — nothing sends until you launch it from the campaign page. (Leads are added separately.)</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-400">Campaign name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`CIQ ${vertical || "Vertical"} v1`} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Daily cap</label>
                <input type="number" value={cap} onChange={(e) => setCap(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">Send from — {selected.size} inbox{selected.size === 1 ? "" : "es"} selected</label>
                <button type="button" onClick={selectWarmed} className="text-[11px] font-medium text-brand-300 hover:text-brand-200">Select warmed</button>
              </div>
              <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-white/10 p-2">
                {inboxes.length === 0 && <p className="px-1 text-xs text-slate-500">No inboxes synced.</p>}
                {inboxes.map((i) => (
                  <label key={i.email} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-300 hover:bg-white/[0.03]">
                    <input type="checkbox" checked={selected.has(i.email)} onChange={() => toggle(i.email)} className="accent-brand-500" />
                    <span className="flex-1 truncate">{i.email}</span>
                    <span className="text-slate-600">wu {i.warmup}</span>
                    <span className={cn("h-1.5 w-1.5 rounded-full", i.status === "active" ? "bg-ok" : i.status === "warming" ? "bg-warn" : "bg-slate-500")} />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-3">
              {created ? (
                <a href={`/campaigns/${created}`} className="inline-flex items-center gap-1.5 rounded-lg bg-ok/15 px-3 py-2 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-ok/25">
                  Draft created — review &amp; launch it <ArrowRight className="h-4 w-4" />
                </a>
              ) : confirm ? (
                <div className="flex items-center gap-2">
                  <Button variant="ok" onClick={create} disabled={creating}>{creating ? "Creating…" : `Confirm — create draft (${selected.size} inboxes)`}</Button>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="primary" onClick={() => setConfirm(true)} disabled={creating || selected.size === 0}>
                  <Rocket className="h-4 w-4" /> Create draft campaign
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
