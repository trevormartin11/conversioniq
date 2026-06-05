"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { generateSequenceAction, proposeVerticalsAction } from "@/app/(dashboard)/copy/actions";
import type { GeneratedStep } from "@/lib/ai/copy";
import type { VerticalIdea } from "@/lib/ai/strategy";

export function StrategyStudio({ aiOn }: { aiOn: boolean }) {
  const [ideas, setIdeas] = useState<VerticalIdea[]>([]);
  const [loadingIdeas, startIdeas] = useTransition();
  const [vertical, setVertical] = useState("");
  const [activeBrief, setActiveBrief] = useState<string | null>(null);
  const [steps, setSteps] = useState<GeneratedStep[]>([]);
  const [source, setSource] = useState<"ai" | "rules" | null>(null);
  const [drafting, startDraft] = useTransition();

  function suggest() {
    startIdeas(async () => setIdeas(await proposeVerticalsAction()));
  }
  function draft(v: string, brief?: string) {
    setVertical(v);
    setActiveBrief(brief ?? null);
    startDraft(async () => {
      const r = await generateSequenceAction(v, brief);
      setSteps(r.steps);
      setSource(r.source);
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
    </div>
  );
}
