"use server";

import { ensureData, getCampaign, getLeads } from "@/lib/data/store";
import { addLeadsToCampaign } from "@/lib/integrations/instantly";
import { integrations } from "@/lib/config";
import { personalizeFromUrl } from "@/lib/ai/personalize";

/** Preview a website-based personalization opener for a single prospect (review before any send). */
export async function previewPersonalizationAction(url: string, context?: { company?: string; vertical?: string }) {
  return personalizeFromUrl(url, context);
}

export interface CampaignPersonalizationRow {
  email: string;
  company: string;
  line: string | null;
  basis: string | null;
}

/** Per-lead wall-clock budget. A slow prospect site (or a slow Outscraper lookup) must not
 *  eat the whole serverless budget — that lead just returns "nothing found" and can be re-run. */
const PER_LEAD_TIMEOUT_MS = 25_000;
/** Leads per action call. The client loops batches so a 500-lead campaign personalizes in
 *  many small requests (progress + retry-able) instead of one doomed 60s+ invocation. */
const PERSONALIZE_BATCH_SIZE = 5;

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), PER_LEAD_TIMEOUT_MS))]);
}

/**
 * Generate personalization for ONE batch of this campaign's leads (those with a website).
 * The Lab calls this in a loop until `done` — covering EVERY lead on the campaign, not a
 * sample — then the operator reviews/edits/approves and loads. Nothing here pushes to sending.
 */
export async function personalizeCampaignBatchAction(
  campaignId: string,
  offset: number,
): Promise<{ items: CampaignPersonalizationRow[]; total: number; done: boolean }> {
  await ensureData();
  if (!getCampaign(campaignId)) return { items: [], total: 0, done: true };
  const all = getLeads().filter((l) => l.campaignId === campaignId && l.domain);
  const safeOffset = Math.max(0, Math.floor(offset));
  const batch = all.slice(safeOffset, safeOffset + PERSONALIZE_BATCH_SIZE);
  const items = await Promise.all(
    batch.map(async (l) => {
      const r = await withTimeout(
        personalizeFromUrl(l.domain, { company: l.company, vertical: l.vertical }),
        { line: null, basis: null, source: "none" as const },
      );
      return { email: l.email, company: l.company, line: r.line, basis: r.basis };
    }),
  );
  return { items, total: all.length, done: safeOffset + batch.length >= all.length };
}

/**
 * Load the operator-approved personalized leads into the campaign's Instantly campaign, each
 * with its line attached as the {{personalization}} merge variable. Gated + fail-safe — only
 * the rows you approved, only if the campaign is linked to Instantly.
 */
export async function loadPersonalizedLeadsAction(
  campaignId: string,
  rows: { email: string; line: string }[],
): Promise<{ ok: boolean; added?: number; failed?: number; error?: string }> {
  await ensureData();
  const c = getCampaign(campaignId);
  if (!c?.instantlyCampaignId) return { ok: false, error: "Link this campaign to Instantly first." };
  if (!integrations.instantly) return { ok: false, error: "Instantly isn't connected." };
  const byEmail = new Map(getLeads().map((l) => [l.email.toLowerCase(), l]));
  const newLeads = rows
    .filter((r) => r.email && r.line.trim())
    .map((r) => {
      const l = byEmail.get(r.email.toLowerCase());
      return {
        email: r.email,
        first_name: l?.firstName,
        last_name: l?.lastName,
        company_name: l?.company,
        phone: l?.phone ?? undefined,
        personalization: r.line.trim(),
      };
    });
  if (!newLeads.length) return { ok: false, error: "No approved lines to load." };
  try {
    const { added, failed } = await addLeadsToCampaign(c.instantlyCampaignId, newLeads);
    return { ok: true, added, failed };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
