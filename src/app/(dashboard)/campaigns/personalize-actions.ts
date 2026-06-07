"use server";

import { ensureData, getCampaign, getLeads } from "@/lib/data/store";
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
