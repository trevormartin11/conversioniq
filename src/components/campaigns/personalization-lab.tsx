"use client";

import { useState } from "react";
import { Loader2, Sparkles, UploadCloud, Users } from "lucide-react";
import {
  loadPersonalizedLeadsAction,
  previewCampaignPersonalizationAction,
  previewPersonalizationAction,
} from "@/app/(dashboard)/campaigns/personalize-actions";

interface BatchRow {
  email: string;
  company: string;
  line: string;
  approved: boolean;
}

/**
 * Phase-1 personalization with a human once-over: try any site (single-URL), or auto-generate
 * a line for each of the campaign's real leads, review/edit/approve, then load the approved
 * ones to Instantly as the {{personalization}} merge variable. Nothing sends until you launch.
 */
export function PersonalizationLab({ aiOn, vertical, campaignId, instantlyLinked }: { aiOn: boolean; vertical?: string; campaignId?: string; instantlyLinked?: boolean }) {
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [res, setRes] = useState<{ line: string | null; basis: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // batch review queue
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    setRows(null);
    setLoadMsg(null);
    try {
      const r = await previewCampaignPersonalizationAction(campaignId);
      setRows(r.items.map((i) => ({ email: i.email, company: i.company, line: i.line ?? "", approved: !!i.line })));
    } catch {
      setRows([]);
    } finally {
      setBatchPending(false);
    }
  }

  function updateRow(email: string, patch: Partial<BatchRow>) {
    setRows((prev) => (prev ? prev.map((r) => (r.email === email ? { ...r, ...patch } : r)) : prev));
  }

  async function loadApproved() {
    if (!campaignId || !rows) return;
    const approved = rows.filter((r) => r.approved && r.line.trim()).map((r) => ({ email: r.email, line: r.line.trim() }));
    if (!approved.length) {
      setLoadMsg({ ok: false, text: "Approve at least one line first." });
      return;
    }
    setLoading(true);
    setLoadMsg(null);
    const r = await loadPersonalizedLeadsAction(campaignId, approved);
    setLoadMsg(r.ok ? { ok: true, text: `Loaded ${r.added} lead${r.added === 1 ? "" : "s"} with personalization${r.failed ? ` (${r.failed} failed)` : ""}.` } : { ok: false, text: r.error ?? "Failed." });
    setLoading(false);
  }

  const inputCls = "h-9 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-ink-600 disabled:opacity-50";
  const approvedCount = rows?.filter((r) => r.approved && r.line.trim()).length ?? 0;

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
        <button onClick={run} disabled={pending || !url.trim() || !aiOn} className={btn}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-brand-400" />}
          {pending ? "Reading site…" : "Generate"}
        </button>
      </div>
      {res?.line && (
        <div className="rounded-lg border border-brand-500/30 bg-brand-600/10 p-3">
          <p className="text-sm text-slate-100">&ldquo;{res.line}&rdquo;</p>
          {res.basis && <p className="mt-1 text-[11px] text-slate-500">From: {res.basis}</p>}
        </div>
      )}
      {note && <p className="text-[11px] text-slate-500">{note}</p>}

      {campaignId && (
        <div className="border-t border-ink-800 pt-3">
          <button onClick={runBatch} disabled={batchPending || !aiOn} className={btn}>
            {batchPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4 text-brand-400" />}
            {batchPending ? "Generating…" : "Generate for this campaign's leads"}
          </button>
          {rows && rows.length === 0 && <p className="mt-2 text-[11px] text-slate-500">No leads with a website on this campaign yet.</p>}
          {rows && rows.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-slate-500">Review &amp; edit each line, untick to skip, then load the approved ones. Empty = standard opener.</p>
              {rows.map((r) => (
                <div key={r.email} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-300">{r.company || r.email}</p>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
                      <input type="checkbox" checked={r.approved} onChange={(e) => updateRow(r.email, { approved: e.target.checked })} className="accent-brand-500" />
                      Approve
                    </label>
                  </div>
                  <textarea
                    value={r.line}
                    onChange={(e) => updateRow(r.email, { line: e.target.value })}
                    rows={2}
                    placeholder="No specific line found — leave empty to use the standard opener."
                    className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              ))}
              {instantlyLinked ? (
                <button onClick={loadApproved} disabled={loading || approvedCount === 0} className={btn}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4 text-brand-400" />}
                  Load {approvedCount} approved to Instantly
                </button>
              ) : (
                <p className="text-[11px] text-slate-500">Link this campaign to Instantly to load these with the {"{{personalization}}"} merge tag.</p>
              )}
              {loadMsg && <p className={`text-[11px] ${loadMsg.ok ? "text-ok" : "text-red-300"}`}>{loadMsg.text}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
