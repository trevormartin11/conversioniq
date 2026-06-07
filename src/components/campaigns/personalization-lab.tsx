"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { previewPersonalizationAction } from "@/app/(dashboard)/campaigns/personalize-actions";

/**
 * Phase-1 personalization preview: type a prospect's website, get one specific, true opener
 * line drawn from their site. Preview-only — nothing sends until reviewed.
 */
export function PersonalizationLab({ aiOn, vertical }: { aiOn: boolean; vertical?: string }) {
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [res, setRes] = useState<{ line: string | null; basis: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    if (!url.trim()) return;
    setPending(true);
    setNote(null);
    setRes(null);
    try {
      const r = await previewPersonalizationAction(url.trim(), { company: company.trim() || undefined, vertical });
      setRes({ line: r.line, basis: r.basis });
      if (!r.line) setNote("Nothing specific + true to reference (or AI/site unavailable) — we'd fall back to the standard opener.");
    } catch {
      setNote("Something went wrong — try again.");
    } finally {
      setPending(false);
    }
  }

  const inputCls = "h-9 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";
  return (
    <div className="space-y-3">
      {!aiOn && <p className="text-[11px] text-warn">Add a Claude key to enable AI personalization.</p>}
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="text-xs text-slate-500">Prospect website</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="radiancemedspa.com" className={`${inputCls} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Company (optional)</span>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Radiance Med Spa" className={`${inputCls} mt-1`} />
        </label>
        <button
          onClick={run}
          disabled={pending || !url.trim() || !aiOn}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 text-sm text-slate-200 transition-colors hover:border-ink-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-brand-400" />}
          {pending ? "Reading site…" : "Generate"}
        </button>
      </div>
      {res?.line && (
        <div className="rounded-lg border border-brand-500/30 bg-brand-600/10 p-3">
          <p className="text-sm text-slate-100">&ldquo;{res.line}&rdquo;</p>
          {res.basis && <p className="mt-1 text-[11px] text-slate-500">From: {res.basis}</p>}
          <p className="mt-1 text-[11px] text-slate-500">Preview only — review before it ever sends.</p>
        </div>
      )}
      {note && <p className="text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}
