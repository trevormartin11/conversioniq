"use client";

import { useState } from "react";
import { Loader2, Sparkles, Users } from "lucide-react";
import {
  previewPersonalizationAction,
  previewCampaignPersonalizationAction,
  type CampaignPersonalizationRow,
} from "@/app/(dashboard)/campaigns/personalize-actions";

/**
 * Phase-1 personalization: a single-URL preview (type any site → one specific, true opener
 * line) plus a batch preview over this campaign's real leads. Preview-only — review before
 * anything sends; approved lines ride to Instantly as the {{personalization}} merge tag.
 */
export function PersonalizationLab({ aiOn, vertical, campaignId }: { aiOn: boolean; vertical?: string; campaignId?: string }) {
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [res, setRes] = useState<{ line: string | null; basis: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // batch
  const [batch, setBatch] = useState<CampaignPersonalizationRow[] | null>(null);
  const [batchPending, setBatchPending] = useState(false);

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

  async function runBatch() {
    if (!campaignId) return;
    setBatchPending(true);
    setBatch(null);
    try {
      const r = await previewCampaignPersonalizationAction(campaignId);
      setBatch(r.items);
    } catch {
      setBatch([]);
    } finally {
      setBatchPending(false);
    }
  }

  const inputCls = "h-9 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";
  return (
    <div className="space-y-4">
      {!aiOn && <p className="text-[11px] text-warn">Add a Claude key to enable AI personalization.</p>}

      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="text-xs text-slate-500">Try any prospect website</span>
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

      {campaignId && (
        <div className="border-t border-ink-800 pt-3">
          <button
            onClick={runBatch}
            disabled={batchPending || !aiOn}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-ink-600 disabled:opacity-50"
          >
            {batchPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4 text-brand-400" />}
            {batchPending ? "Generating…" : "Generate for this campaign's leads"}
          </button>
          {batch && batch.length === 0 && <p className="mt-2 text-[11px] text-slate-500">No leads with a website on this campaign yet.</p>}
          {batch && batch.length > 0 && (
            <div className="mt-3 space-y-2">
              {batch.map((row) => (
                <div key={row.email} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
                  <p className="text-xs font-medium text-slate-300">{row.company || row.email}</p>
                  {row.line ? (
                    <p className="mt-1 text-sm text-slate-100">&ldquo;{row.line}&rdquo;</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-500">No specific line — falls back to the standard opener.</p>
                  )}
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Preview only. Approved lines ride to Instantly as {"{{personalization}}"} when leads are loaded.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
