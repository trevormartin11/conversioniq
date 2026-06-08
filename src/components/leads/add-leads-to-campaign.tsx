"use client";

import { useMemo, useState, useTransition } from "react";
import { ClipboardList, Search, Upload } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SourcingPlanner, type PlannerCampaign } from "./sourcing-planner";
import { loadLeadsIntoCampaignAction } from "@/app/(dashboard)/leads/actions";
import type { SourcedLead } from "@/lib/sourcing/types";

/** Parse pasted rows — "email" per line, or CSV "email, First, Last, Company". Email is required. */
function parseRows(text: string): SourcedLead[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      const email = (parts.find((p) => p.includes("@")) ?? "").toLowerCase();
      const [firstName, lastName, company] = parts.filter((p) => !p.includes("@"));
      const domain = email.split("@")[1] ?? "";
      return {
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        company: company || domain || "(unknown)",
        domain: domain || undefined,
        source: "import" as const,
      };
    })
    .filter((r) => r.email.includes("@"));
}

/**
 * Campaign-first lead loading — the job this page exists for. Pick an initiated campaign, then either
 * source new leads (planner, pre-targeted to its vertical + locked to load into it) or paste/CSV an
 * existing list. Both run the same persist → Zoho → Instantly spine with the load-time suppression gate.
 */
export function AddLeadsToCampaign({ campaigns }: { campaigns: PlannerCampaign[] }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [mode, setMode] = useState<"source" | "paste">("source");
  const selected = useMemo(() => campaigns.find((c) => c.id === campaignId), [campaigns, campaignId]);

  // paste flow
  const [text, setText] = useState("");
  const [loading, start] = useTransition();
  const parsed = useMemo(() => parseRows(text), [text]);

  function addPasted() {
    if (!selected || !parsed.length) return;
    start(async () => {
      const r = await loadLeadsIntoCampaignAction({ campaignId: selected.id, leads: parsed });
      if (!r.ok) return toast.error(r.error ?? "Could not add leads.");
      toast.success(`Added ${r.persisted} lead${r.persisted === 1 ? "" : "s"}${r.instantlyAdded ? ` · ${r.instantlyAdded} into Instantly` : ""}.`);
      setText("");
    });
  }

  if (campaigns.length === 0) {
    return (
      <Card><CardBody className="text-sm text-slate-400">
        No campaigns yet — create one in the launch wizard first, then come back to load leads into it.
      </CardBody></Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        {/* 1 — pick the campaign */}
        <div>
          <label className="block text-xs font-medium text-slate-400">Campaign</label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="h-10 min-w-[16rem] flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {selected && (
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <Tag tone="slate">{selected.vertical}</Tag>
                <Tag tone={selected.hasInstantly ? "ok" : "warn"}>{selected.hasInstantly ? "live in Instantly" : "draft — Zoho only"}</Tag>
              </span>
            )}
          </div>
          {selected && !selected.hasInstantly && (
            <p className="mt-1 text-[11px] text-slate-500">This campaign isn&apos;t pushed to Instantly yet — leads will persist + sync to Zoho, then load into sending once you push it.</p>
          )}
        </div>

        {/* 2 — how to add */}
        <div className="flex gap-2">
          {([["source", "Source new", Search], ["paste", "Paste / CSV list", ClipboardList]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mode === key ? "bg-brand-600/15 text-brand-300 ring-1 ring-inset ring-brand-500/30" : "bg-ink-800/60 text-slate-400 ring-1 ring-inset ring-white/10 hover:text-slate-200",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* 3 — the chosen lane */}
        {mode === "source" ? (
          selected && <SourcingPlanner key={selected.id} campaigns={[]} lockCampaign={selected} initialVertical={selected.vertical} />
        ) : (
          <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="text-xs text-slate-400">Paste emails (one per line), or CSV rows <span className="text-slate-500">email, First, Last, Company</span>. Suppressed + already-contacted addresses are stripped on load.</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={"sarah@radiancemedspa.com\nowner@elitelaserspa.com, Dana, Cole, Elite Laser Spa\n…"}
              className="w-full resize-y rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <Button variant="primary" disabled={loading || !parsed.length || !selected} onClick={addPasted}>
                <Upload className="h-4 w-4" /> {loading ? "Adding…" : `Add ${parsed.length || ""} to ${selected?.name ?? "campaign"}`.trim()}
              </Button>
              {text.trim() && <span className="text-xs text-slate-500">{parsed.length} valid email{parsed.length === 1 ? "" : "s"} detected</span>}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
