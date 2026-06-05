"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { generateSequenceAction } from "@/app/(dashboard)/copy/actions";
import type { GeneratedStep } from "@/lib/ai/copy";

const VERTICALS = ["Med Spa", "Dental", "Home Services", "Auto", "Law", "Hospitality"];

export function CopyStudio({ aiOn }: { aiOn: boolean }) {
  const [vertical, setVertical] = useState("Med Spa");
  const [steps, setSteps] = useState<GeneratedStep[]>([]);
  const [source, setSource] = useState<"ai" | "rules" | null>(null);
  const [pending, start] = useTransition();

  function gen() {
    start(async () => {
      const r = await generateSequenceAction(vertical);
      setSteps(r.steps);
      setSource(r.source);
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1">
            <label className="block text-xs font-medium text-slate-400">Vertical for the new campaign</label>
            <input
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              list="ciq-verticals"
              className="mt-1 h-9 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
            />
            <datalist id="ciq-verticals">{VERTICALS.map((v) => <option key={v} value={v} />)}</datalist>
          </div>
          <Button variant="primary" onClick={gen} disabled={pending}>
            <Sparkles className="h-4 w-4" /> {pending ? "Drafting…" : "Draft sequence"}
          </Button>
        </div>

        {source && (
          <div className="mt-3 flex items-center gap-2">
            <Tag tone={source === "ai" ? "brand" : "slate"}>{source === "ai" ? "Claude-generated" : "templated"}</Tag>
            {source === "rules" && !aiOn && <span className="text-[11px] text-slate-500">Add a Claude key to generate with AI.</span>}
          </div>
        )}

        <div className="mt-3 space-y-3">
          {steps.map((s) => (
            <div key={s.step} className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-300">Step {s.step}</span>
              <p className="mt-1 text-sm font-semibold text-slate-100">{s.subject}</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-400">{s.body}</p>
              {s.rationale && <p className="mt-1.5 text-[11px] italic text-slate-500">Why: {s.rationale}</p>}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
