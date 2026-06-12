"use server";

import { revalidatePath } from "next/cache";
import { addLeads, dedupeAgainstUniverse, ensureData, getCampaign, getDomains, getInboxes, getPersonas, isSuppressed, pushAudit, searchUniverse } from "@/lib/data/store";
import type { NewLead } from "@/lib/data/store";
import { getCurrentUser } from "@/lib/auth";
import { buildPlan, runSourcing } from "@/lib/sourcing/engine";
import { isValidCount, MAX_RUN_COUNT } from "@/lib/sourcing/cost";
import { addLeadsToCampaign } from "@/lib/integrations/instantly";
import { createLead as zohoCreateLead } from "@/lib/integrations/zoho";
import { integrations } from "@/lib/config";
import { extractEmail } from "@/lib/email";
import { num } from "@/lib/format";
import type { SizeBand, SourcedLead } from "@/lib/sourcing/types";

interface SourcingInput { vertical: string; geo?: string; sizeBand?: SizeBand; count: number; budgetCap: number }
const toTarget = (i: SourcingInput) => ({ vertical: i.vertical.trim(), geo: i.geo?.trim() || undefined, sizeBand: i.sizeBand });

/** Route + cost a sourcing run — ZERO spend. Shows the operator the plan first. */
export async function planSourcingAction(input: SourcingInput) {
  await ensureData();
  if (!input.vertical.trim()) return { ok: false as const, error: "Enter a vertical to target." };
  if (!isValidCount(input.count)) return { ok: false as const, error: `Enter a lead count between 1 and ${num(MAX_RUN_COUNT)}.` };
  return { ok: true as const, plan: buildPlan(toTarget(input), input.count, input.budgetCap) };
}

/** Execute the routed pipeline (search -> enrich -> verify -> dedupe). Gated on keys + budget. */
export async function runSourcingAction(input: SourcingInput) {
  await ensureData();
  if (!input.vertical.trim()) return { ok: false as const, plan: null, leads: [], rejected: [], stats: null, error: "Enter a vertical to target." };
  if (!isValidCount(input.count)) return { ok: false as const, plan: null, leads: [], rejected: [], stats: null, error: `Enter a lead count between 1 and ${num(MAX_RUN_COUNT)}.` };
  const user = await getCurrentUser();
  const res = await runSourcing(toTarget(input), input.count, input.budgetCap);
  // Audit every real (key-ready) run attempt — the spend record, alongside the platform cap.
  if (res.plan?.ready) {
    await pushAudit(user.name, res.ok ? "sourcing.run" : "sourcing.failed", "sourcing", input.vertical.trim(), {
      provider: res.plan.route.provider,
      count: input.count,
      projectedCost: res.plan.estimate.projectedCost,
      sourced: res.stats?.sourced ?? 0,
      verified: res.stats?.verified ?? 0,
    });
  }
  return res;
}

/** "Have we ever touched this person or domain?" — instant lookup. */
export async function checkTouchedAction(value: string) {
  await ensureData();
  const v = value.trim();
  if (!v) return { ok: false as const };
  const { suppressed, entry } = isSuppressed(v.includes("@") ? v : `x@${v}`);
  const matches = searchUniverse(v);
  return {
    ok: true as const,
    suppressed,
    reason: entry?.reason ?? null,
    leadMatches: matches.leads.slice(0, 5).map((l) => ({ name: `${l.firstName} ${l.lastName}`, email: l.email, company: l.company, status: l.status })),
    suppressionMatches: matches.suppression.length,
  };
}

/**
 * Dedupe a pasted list (one email per line) against the entire contacted + DNC
 * universe BEFORE anyone enters a campaign — the load-time suppression gate.
 */
export async function dedupeListAction(text: string) {
  await ensureData();
  // Parse each token through the canonical extractor: a "Name <addr>" / dotted / quoted
  // token must reduce to the same normalized key the suppression gate compares against,
  // or a DNC address slips through (it has an "@" but never matches the suppression entry).
  const emails = text
    .split(/[\s,;]+/)
    .map((t) => extractEmail(t))
    .filter((e): e is string => !!e)
    .map((email) => ({ email }));
  const { clean, rejected } = dedupeAgainstUniverse(emails);
  return {
    ok: true as const,
    total: emails.length,
    cleanCount: clean.length,
    rejected: rejected.slice(0, 50),
  };
}

/**
 * The spine: persist sourced leads with attribution-at-source, create them in Zoho
 * (canonical), then load them into the campaign's Instantly campaign. Suppression /
 * dedupe is re-applied at load time (it may have changed since the run).
 */
export async function loadLeadsIntoCampaignAction(input: { campaignId: string; leads: SourcedLead[] }) {
  await ensureData();
  const user = await getCurrentUser();
  const campaign = getCampaign(input.campaignId);
  if (!campaign) return { ok: false as const, error: "Pick a campaign to load into." };
  if (!input.leads?.length) return { ok: false as const, error: "No leads to load." };

  // Defense-in-depth: re-apply the load-time suppression gate (keeps our typed leads).
  // Normalize + validate the address (a whitespace-only or malformed "email" must not persist),
  // and dedupe in-batch first-wins keyed on the normalized address (so the surviving row's data
  // matches the address the suppression gate actually vetted).
  const byEmail = new Map<string, SourcedLead & { email: string }>();
  for (const l of input.leads) {
    const email = extractEmail(l.email ?? "");
    if (email && !byEmail.has(email)) byEmail.set(email, { ...l, email });
  }
  const { clean } = dedupeAgainstUniverse([...byEmail.values()]);
  if (!clean.length) return { ok: false as const, error: "Every lead was already suppressed, invalid, or a duplicate." };

  // Attribution at source — resolved from the campaign.
  const persona = getPersonas().find((p) => p.id === campaign.personaId)?.name ?? campaign.personaId;
  const firstInbox = getInboxes().find((i) => campaign.inboxIds.includes(i.id));
  const sendingDomain = (firstInbox && getDomains().find((d) => d.id === firstInbox.domainId)?.domain) || "";

  // 1) Create each in Zoho (canonical) — best-effort; capture the canonical id.
  let zohoCreated = 0;
  const prepared: NewLead[] = [];
  for (const l of clean) {
    let zohoLeadId: string | null = null;
    if (integrations.zoho) {
      try {
        const res = (await zohoCreateLead({
          Email: l.email,
          First_Name: l.firstName ?? "",
          Last_Name: l.lastName || l.company, // Zoho requires Last_Name — fall back to company
          Company: l.company,
          Phone: l.phone ?? null,
          Lead_Source: `ConversionIQ / ${l.source}`,
          Lead_Status: "New",
        })) as { data?: { details?: { id?: string } }[] };
        zohoLeadId = res?.data?.[0]?.details?.id ?? null;
        if (zohoLeadId) zohoCreated++;
      } catch { /* still persist in-hub; Zoho can be reconciled later */ }
    }
    prepared.push({
      email: l.email,
      domain: l.domain || l.email.split("@")[1] || "",
      firstName: l.firstName ?? "",
      lastName: l.lastName ?? "",
      company: l.company,
      title: l.title ?? "",
      phone: l.phone ?? null,
      campaignId: campaign.id,
      vertical: campaign.vertical,
      persona,
      sendingDomain,
      listVersion: campaign.listVersion,
      source: l.source,
      attributionOwner: user.name,
      status: "new",
      zohoLeadId,
      apolloId: null,
      lastContactedAt: null,
    });
  }

  // 2) Persist in the hub (the universe + attribution backbone).
  const persisted = await addLeads(prepared, user.name);

  // 3) Load into Instantly — only if the campaign is live there. Never throw past the
  // {ok,error} envelope: the leads are already persisted, and a thrown error here replaced
  // the page with the error boundary while a retry then reported "already a duplicate".
  let instantlyAdded = 0;
  let instantlyFailed = 0;
  let note = "";
  if (campaign.instantlyCampaignId && integrations.instantly) {
    try {
      const res = await addLeadsToCampaign(
        campaign.instantlyCampaignId,
        // personalization defaults to empty so {{personalization}} renders blank deterministically
        // for non-personalized leads (no reliance on Instantly's undefined-variable behavior).
        clean.map((l) => ({ email: l.email, first_name: l.firstName, last_name: l.lastName, company_name: l.company, phone: l.phone, personalization: "" })),
      );
      instantlyAdded = res.added;
      instantlyFailed = res.failed;
    } catch (e) {
      instantlyFailed = clean.length;
      note = `Leads saved in the hub, but the Instantly load failed (${(e as Error).message}) — they'll load on the next sync, or re-push the campaign.`;
    }
  } else {
    note = "Persisted + created in Zoho. Push this campaign to Instantly to load these into sending.";
  }

  await pushAudit(user.name, "leads.loaded_into_campaign", "campaign", campaign.id, {
    persisted: persisted.length, zohoCreated, instantlyAdded, instantlyFailed,
  });
  revalidatePath("/leads");
  revalidatePath("/campaigns");
  return { ok: true as const, persisted: persisted.length, zohoCreated, instantlyAdded, instantlyFailed, note };
}
