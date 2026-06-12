"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { approveLandingPage, ensureData, generateLandingPage, getCampaign, getDomains, getInboxes, getLandingPage, publishLandingPage, setLandingConfig, updateLandingContent } from "@/lib/data/store";
import { publishHostFor, recordNameFor, VERCEL_CNAME_TARGET } from "@/lib/landing/publish";
import { addProjectDomain, vercelConfigured } from "@/lib/integrations/vercel";
import { ensureCname } from "@/lib/integrations/namecheap";
import { integrations } from "@/lib/config";
import type { LandingContent } from "@/lib/data/types";

function rev() {
  revalidatePath("/campaigns");
}

/** Generate (or regenerate) the landing-page copy for a campaign. Lands in draft for sign-off. */
export async function generateLandingPageAction(campaignId: string) {
  await ensureData();
  const user = await getCurrentUser();
  const p = await generateLandingPage(campaignId, user.name);
  rev();
  return p ? { ok: true as const, id: p.id, source: p.source } : { ok: false as const, error: "Campaign not found." };
}

export async function saveLandingContentAction(campaignId: string, content: LandingContent) {
  await ensureData();
  const user = await getCurrentUser();
  const p = await updateLandingContent(campaignId, content, user.name);
  rev();
  return p ? { ok: true as const } : { ok: false as const, error: "No landing page to save." };
}

export async function approveLandingPageAction(campaignId: string) {
  await ensureData();
  const user = await getCurrentUser();
  const p = await approveLandingPage(campaignId, user.name);
  rev();
  return p ? { ok: true as const } : { ok: false as const, error: "No landing page to approve." };
}

/** First sending domain of the campaign's assigned inboxes — where its page belongs. */
function campaignSendingDomain(campaignId: string): string | null {
  const c = getCampaign(campaignId);
  if (!c) return null;
  const inbox = getInboxes().find((i) => c.inboxIds.includes(i.id));
  const d = inbox ? getDomains().find((x) => x.id === inbox.domainId) : null;
  return d?.domain ?? (inbox ? inbox.email.split("@")[1] ?? null : null);
}

/**
 * Publish an APPROVED page to go.<domain>: attach the host to this Vercel project, add the
 * CNAME at Namecheap (read-merge-write — never touches the sending domain's other records),
 * then mark the page published so the public router starts serving it. Each prerequisite
 * failure is reported by name; nothing is marked live unless serving can actually work.
 */
export async function publishLandingPageAction(campaignId: string) {
  await ensureData();
  const user = await getCurrentUser();
  const p = getLandingPage(campaignId);
  if (!p) return { ok: false as const, error: "No landing page — generate one first." };
  if (p.status === "draft") return { ok: false as const, error: "Approve the page first — publishing ships it to prospects." };

  // Auto-assign the campaign's sending domain when none was picked: the page belongs on the
  // domain the campaign actually sends from (first assigned inbox's domain).
  let domain = p.domain;
  if (!domain) {
    domain = campaignSendingDomain(campaignId);
    if (!domain) return { ok: false as const, error: "No domain available — assign sending inboxes to this campaign (or set a domain in the page settings) first." };
    await setLandingConfig(campaignId, { domain }, user.name);
  }

  const host = publishHostFor(domain);
  const url = `https://${host}`;
  const notes: string[] = [];

  // Live mode requires the real plumbing; preview/demo mode simulates the publish.
  if (integrations.supabase) {
    if (!vercelConfigured()) {
      return { ok: false as const, error: "Add VERCEL_TOKEN + VERCEL_PROJECT_ID (Vercel → Settings → Tokens) so the hub can attach the domain, then publish again." };
    }
    const dom = await addProjectDomain(host);
    if (!dom.ok) return { ok: false as const, error: `Vercel domain attach failed: ${dom.error}` };
    notes.push(`Vercel: ${host} attached`);
    if (integrations.namecheap) {
      try {
        const dns = await ensureCname(domain, recordNameFor(host, domain), VERCEL_CNAME_TARGET);
        notes.push(dns.added ? `DNS: CNAME ${host} → ${VERCEL_CNAME_TARGET} created` : "DNS: record already present");
      } catch (e) {
        return { ok: false as const, error: `DNS failed: ${(e as Error).message}. Add the CNAME manually (${host} → ${VERCEL_CNAME_TARGET}) and publish again.` };
      }
    } else {
      notes.push(`DNS: Namecheap not connected — add CNAME ${host} → ${VERCEL_CNAME_TARGET} manually`);
    }
  } else {
    notes.push("Preview mode — publish simulated (no DNS/Vercel calls)");
  }

  await publishLandingPage(campaignId, url, user.name);
  rev();
  return { ok: true as const, url, notes };
}

export async function setLandingConfigAction(campaignId: string, cfg: { domain?: string | null; schedulerUrl?: string | null; videoUrl?: string | null }) {
  await ensureData();
  const user = await getCurrentUser();
  const p = await setLandingConfig(campaignId, cfg, user.name);
  rev();
  return p ? { ok: true as const } : { ok: false as const, error: "No landing page." };
}
