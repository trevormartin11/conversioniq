"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PencilLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { LandingTemplate } from "@/components/landing/landing-template";
import { saveLandingContentAction } from "@/app/(dashboard)/campaigns/landing-actions";
import type { LandingContent, LandingStatus } from "@/lib/data/types";

/**
 * Edit-in-place workbench for the landing page: toggle "Edit copy", change any text with the
 * LIVE preview updating as you type, Save. Saving a draft/approved page returns it to draft
 * (re-approval keeps the sign-off meaningful); saving a PUBLISHED page goes live immediately —
 * never taking the URL offline.
 */
export function LandingWorkbench({ campaignId, content, status, schedulerUrl, videoUrl }: { campaignId: string; content: LandingContent; status: LandingStatus; schedulerUrl: string | null; videoUrl: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LandingContent>(content);

  function patch(p: Partial<LandingContent>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function save() {
    start(async () => {
      try {
        const r = await saveLandingContentAction(campaignId, draft);
        if (!r.ok) return toast.error(r.error);
        toast.success(
          status === "published"
            ? "Saved — the live page is updated."
            : "Saved — back to draft; approve again when it reads right.",
        );
        setEditing(false);
      } catch {
        toast.error("Save didn't go through — try again.");
      }
      router.refresh();
    });
  }

  const input = "w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";
  const label = "block text-[11px] font-medium uppercase tracking-wide text-slate-500";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{editing ? "Editing — the preview below updates as you type." : "Preview — exactly what publishes."}</p>
        {editing ? (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={save}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save copy
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(content); setEditing(false); }}>
              <X className="h-3.5 w-3.5" /> Discard
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <PencilLine className="h-3.5 w-3.5" /> Edit copy
          </Button>
        )}
      </div>

      {editing && (
        <div className="grid gap-3 rounded-xl border border-ink-700 bg-ink-900/40 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <span className={label}>Hero</span>
            <input className={input} value={draft.hero.eyebrow} onChange={(e) => patch({ hero: { ...draft.hero, eyebrow: e.target.value } })} placeholder="Eyebrow" />
            <input className={input} value={draft.hero.headline} onChange={(e) => patch({ hero: { ...draft.hero, headline: e.target.value } })} placeholder="Headline" />
            <textarea className={input} rows={2} value={draft.hero.subhead} onChange={(e) => patch({ hero: { ...draft.hero, subhead: e.target.value } })} placeholder="Subhead" />
            <div className="grid grid-cols-2 gap-2">
              <input className={input} value={draft.hero.primaryCta} onChange={(e) => patch({ hero: { ...draft.hero, primaryCta: e.target.value } })} placeholder="Primary CTA" />
              <input className={input} value={draft.hero.secondaryCta} onChange={(e) => patch({ hero: { ...draft.hero, secondaryCta: e.target.value } })} placeholder="Secondary CTA" />
            </div>
            <span className={label}>Problem</span>
            <input className={input} value={draft.problem.heading} onChange={(e) => patch({ problem: { ...draft.problem, heading: e.target.value } })} placeholder="Heading" />
            <textarea className={input} rows={3} value={draft.problem.body} onChange={(e) => patch({ problem: { ...draft.problem, body: e.target.value } })} placeholder="Body" />
            <textarea
              className={input}
              rows={3}
              value={draft.problem.bullets.join("\n")}
              onChange={(e) => patch({ problem: { ...draft.problem, bullets: e.target.value.split("\n").filter((b) => b.trim()) } })}
              placeholder="Bullets — one per line"
            />
            <span className={label}>SEO</span>
            <input className={input} value={draft.seoTitle} onChange={(e) => patch({ seoTitle: e.target.value })} placeholder="SEO title" />
            <textarea className={input} rows={2} value={draft.seoDescription} onChange={(e) => patch({ seoDescription: e.target.value })} placeholder="SEO description" />
          </div>

          <div className="space-y-2">
            <span className={label}>Features</span>
            {draft.features.map((f, i) => (
              <div key={i} className="space-y-1 rounded-lg border border-ink-800 p-2">
                <input
                  className={input}
                  value={f.title}
                  onChange={(e) => patch({ features: draft.features.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                  placeholder={`Feature ${i + 1} title`}
                />
                <textarea
                  className={input}
                  rows={2}
                  value={f.body}
                  onChange={(e) => patch({ features: draft.features.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })}
                  placeholder="Feature body"
                />
              </div>
            ))}
            <span className={label}>Video section</span>
            <input className={input} value={draft.videoHeading} onChange={(e) => patch({ videoHeading: e.target.value })} placeholder="Video heading" />
            <input className={input} value={draft.videoCaption} onChange={(e) => patch({ videoCaption: e.target.value })} placeholder="Video caption" />
            <span className={label}>Trust</span>
            <input className={input} value={draft.trust.heading} onChange={(e) => patch({ trust: { ...draft.trust, heading: e.target.value } })} placeholder="Trust heading" />
            <textarea
              className={input}
              rows={3}
              value={draft.trust.points.join("\n")}
              onChange={(e) => patch({ trust: { ...draft.trust, points: e.target.value.split("\n").filter((p) => p.trim()) } })}
              placeholder="Trust points — one per line"
            />
            <span className={label}>Closing CTA</span>
            <input className={input} value={draft.cta.heading} onChange={(e) => patch({ cta: { ...draft.cta, heading: e.target.value } })} placeholder="CTA heading" />
            <textarea className={input} rows={2} value={draft.cta.body} onChange={(e) => patch({ cta: { ...draft.cta, body: e.target.value } })} placeholder="CTA body" />
            <div className="grid grid-cols-2 gap-2">
              <input className={input} value={draft.cta.bookCta} onChange={(e) => patch({ cta: { ...draft.cta, bookCta: e.target.value } })} placeholder="Book button" />
              <input className={input} value={draft.formIntro} onChange={(e) => patch({ formIntro: e.target.value })} placeholder="Form intro" />
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-ink-700">
        <LandingTemplate content={editing ? draft : content} schedulerUrl={schedulerUrl} videoUrl={videoUrl} />
      </div>
    </div>
  );
}
