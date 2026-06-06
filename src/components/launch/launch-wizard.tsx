"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { previewSequenceAction } from "@/app/(dashboard)/launch/actions";
import { createCampaignAction } from "@/app/(dashboard)/campaigns/actions";
import type { GeneratedStep } from "@/lib/ai/copy";

const STEPS = ["Vertical", "People", "Sequence", "Send"] as const;
type Persona = { id: string; name: string };

// Default outbound cadence — days from the first touch — so the sequence reads like a real plan.
const CADENCE_DAYS = [0, 3, 7, 12];
const dayFor = (i: number) =>
  CADENCE_DAYS[i] ?? CADENCE_DAYS[CADENCE_DAYS.length - 1] + (i - CADENCE_DAYS.length + 1) * 5;

const TITLE_SUGGESTIONS = ["Owner / Founder", "CEO", "Marketing Manager", "Practice Manager", "Office Manager", "Director of Sales"];

export function LaunchWizard({
  personas,
  suggestions,
  dailyGoal,
  monthlyBudget,
}: {
  personas: Persona[];
  suggestions: string[];
  dailyGoal: number;
  monthlyBudget: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [vertical, setVertical] = useState("");
  const [problem, setProblem] = useState("");
  const [titles, setTitles] = useState("");
  const [leadTarget, setLeadTarget] = useState(500);
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [dailyCap, setDailyCap] = useState(80);
  const [name, setName] = useState("");
  const [seq, setSeq] = useState<{ steps: GeneratedStep[]; source: "ai" | "rules" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const maxCostPerDemo = monthlyBudget / (dailyGoal * 30);
  const maxCostPerLead = maxCostPerDemo * 0.01;
  const selectedTitles = titles.split(",").map((x) => x.trim()).filter(Boolean);

  function next() {
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }
  function toggleTitle(t: string) {
    const has = selectedTitles.includes(t);
    setTitles((has ? selectedTitles.filter((x) => x !== t) : [...selectedTitles, t]).join(", "));
  }

  function generate() {
    setError(null);
    start(async () => {
      const brief = [problem.trim(), selectedTitles.length ? `Decision-makers: ${selectedTitles.join(", ")}` : ""].filter(Boolean).join(". ");
      const res = await previewSequenceAction(vertical, brief);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSeq({ steps: res.steps, source: res.source });
    });
  }

  function create() {
    setError(null);
    start(async () => {
      const res = (await createCampaignAction({
        name: name.trim() || `${vertical} — v1`,
        vertical,
        personaId,
        dailyCap: Number(dailyCap) || 80,
      })) as { ok: boolean; id?: string; error?: string };
      if (!res.ok) {
        setError(res.error ?? "Could not create campaign.");
        return;
      }
      router.push(res.id ? `/campaigns/${res.id}` : "/campaigns");
      router.refresh();
    });
  }

  const inputCls = "h-10 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                i < step ? "bg-ok text-ink-950" : i === step ? "bg-brand-gradient text-white" : "bg-ink-800 text-slate-500",
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn("text-sm", i === step ? "text-slate-100" : "text-slate-500")}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-6 bg-ink-700 sm:block" />}
          </div>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-4">
          {/* 1 — vertical + the problem */}
          {step === 0 && (
            <>
              <div>
                <p className="text-sm font-medium text-slate-100">1. Pick a vertical &amp; name the problem</p>
                <p className="text-xs text-slate-500">Who you&apos;re going after, and the specific pain you&apos;ll open with — this anchors the whole sequence.</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Vertical / ICP</p>
                <input value={vertical} onChange={(e) => setVertical(e.target.value)} placeholder="e.g. Med Spas, HVAC contractors, dental groups" className={cn(inputCls, "mt-1")} />
                {suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestions.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setVertical(sug)}
                        className={cn("chip", vertical === sug ? "bg-brand/15 text-brand-300 ring-1 ring-inset ring-brand-500/25" : "bg-ink-700/60 text-slate-300 ring-1 ring-inset ring-white/10")}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">The problem you&apos;re calling out</p>
                <textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  rows={3}
                  placeholder="e.g. After-hours DMs and website chats go unanswered, so booking-ready buyers quietly leak to whoever replies first."
                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">One specific, felt pain beats a feature list — it becomes the angle of the opener.</p>
              </div>
            </>
          )}

          {/* 2 — the people */}
          {step === 1 && (
            <>
              <div>
                <p className="text-sm font-medium text-slate-100">2. Find the people</p>
                <p className="text-xs text-slate-500">
                  Who inside each {vertical || "company"} actually feels this and can say yes. We source → enrich → verify → dedupe → load (live once your data keys are connected).
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Target titles / roles</p>
                <input value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="e.g. Owner, Practice Manager, Marketing Director" className={cn(inputCls, "mt-1")} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {TITLE_SUGGESTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTitle(t)}
                      className={cn("chip", selectedTitles.includes(t) ? "bg-brand/15 text-brand-300 ring-1 ring-inset ring-brand-500/25" : "bg-ink-700/60 text-slate-300 ring-1 ring-inset ring-white/10")}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Target net-new prospects</p>
                <input type="number" value={leadTarget} onChange={(e) => setLeadTarget(Number(e.target.value))} min={0} className="mt-1 h-10 w-40 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-ink-800/60 p-3">
                  <p className="text-xs text-slate-500">Budget ceiling</p>
                  <p className="text-sm text-slate-200">{`~$${maxCostPerLead.toFixed(2)}/lead · ~$${maxCostPerDemo.toFixed(2)}/demo`}</p>
                </div>
                <div className="rounded-lg bg-ink-800/60 p-3">
                  <p className="text-xs text-slate-500">Est. spend for {leadTarget} prospects</p>
                  <p className="text-sm text-slate-200">{`~$${(leadTarget * maxCostPerLead).toFixed(0)} at ceiling`}</p>
                </div>
              </div>
            </>
          )}

          {/* 3 — sequence + cadence */}
          {step === 2 && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">3. Build the sequence &amp; cadence</p>
                  <p className="text-xs text-slate-500">
                    A multi-touch sequence in our voice for {vertical || "the vertical"}
                    {selectedTitles.length ? `, written to ${selectedTitles.join(" / ")}` : ""}, spaced on a proven cadence.
                  </p>
                </div>
                <Button variant="secondary" onClick={generate} disabled={pending || !vertical.trim()}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : seq ? "Regenerate" : "Generate"}
                </Button>
              </div>
              {!seq && (
                <p className="text-xs text-slate-500">
                  Generate drafts {CADENCE_DAYS.length} touches across ~{CADENCE_DAYS[CADENCE_DAYS.length - 1]} days. Refine every line in Copy Coach after.
                </p>
              )}
              {seq && (
                <div className="space-y-2">
                  <Tag tone={seq.source === "ai" ? "brand" : "slate"}>{seq.source === "ai" ? "AI-generated" : "Playbook template"}</Tag>
                  {seq.steps.map((st, i) => {
                    const day = dayFor(i);
                    const wait = i === 0 ? 0 : day - dayFor(i - 1);
                    return (
                      <div key={st.step} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-600/15 px-2 py-0.5 text-[11px] font-medium text-brand-300">
                            <Clock className="h-3 w-3" />
                            {day === 0 ? "Day 0 — send" : `Day ${day}`}
                          </span>
                          {wait > 0 && <span className="text-[11px] text-slate-500">wait {wait} day{wait > 1 ? "s" : ""}</span>}
                          <span className="text-[11px] text-slate-500">Touch {st.step}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-200">{st.subject}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{st.body}</p>
                        {st.rationale && <p className="mt-1 text-[11px] text-slate-500">Why: {st.rationale}</p>}
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-slate-500">Refine every line + the cadence in Copy Coach after the campaign is created.</p>
                </div>
              )}
            </>
          )}

          {/* 4 — send */}
          {step === 3 && (
            <>
              <div>
                <p className="text-sm font-medium text-slate-100">4. Sending identity &amp; throttle</p>
                <p className="text-xs text-slate-500">Creates the campaign as a draft — you launch it from the campaign page once inboxes are warm.</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Campaign name</p>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${vertical || "Vertical"} — v1`} className={cn(inputCls, "mt-1")} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-400">Sending persona</p>
                  <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className={cn(inputCls, "mt-1")}>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400">Daily send cap</p>
                  <input type="number" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} min={1} className={cn(inputCls, "mt-1")} />
                </div>
              </div>
              {/* Recap of the whole plan */}
              <div className="space-y-1 rounded-lg border border-ink-700 bg-ink-800/40 p-3 text-xs text-slate-400">
                <p><span className="text-slate-500">Vertical:</span> {vertical || "—"}</p>
                <p><span className="text-slate-500">Problem:</span> {problem.trim() || "—"}</p>
                <p><span className="text-slate-500">People:</span> {selectedTitles.length ? selectedTitles.join(", ") : "—"}</p>
                <p><span className="text-slate-500">Sequence:</span> {seq ? `${seq.steps.length} touches over ~${dayFor(seq.steps.length - 1)} days` : "not generated yet"}</p>
              </div>
            </>
          )}

          {error && <p className="text-xs text-bad">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={back} disabled={step === 0 || pending}>Back</Button>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={next} disabled={(step === 0 && !vertical.trim()) || pending}>Next</Button>
            ) : (
              <Button variant="primary" onClick={create} disabled={pending || !vertical.trim()}>
                {pending ? "Creating…" : "Create campaign"}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
