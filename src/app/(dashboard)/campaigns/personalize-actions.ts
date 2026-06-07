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

/**
 * Generate personalization for a sample of THIS campaign's real leads (those with a website),
 * for review. Capped + parallel; nothing is pushed to sending — that's a separate gated step.
 */
export async function previewCampaignPersonalizationAction(campaignId: string): Promise<{ items: CampaignPersonalizationRow[] }> {
  await ensureData();
  if (!getCampaign(campaignId)) return { items: [] };
  const leads = getLeads().filter((l) => l.campaignId === campaignId && l.domain).slice(0, 6);
  const items = await Promise.all(
    leads.map(async (l) => {
      const r = await personalizeFromUrl(l.domain, { company: l.company, vertical: l.vertical });
      return { email: l.email, company: l.company, line: r.line, basis: r.basis };
    }),
  );
  return { items };
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
