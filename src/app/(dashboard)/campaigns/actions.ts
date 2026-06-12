"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addCampaign, cloneCampaign, deleteCampaign, ensureData, getCampaign, getInboxes, getLandingPage, getLeads, getVariants, pushAudit, reassignCampaignLeads, seedCampaignVariants, setCampaignAttribution, setCampaignStatus, upsertCanonicalCampaign } from "@/lib/data/store";
import { activateCampaign, addLeadsToCampaign, createInstantlyCampaign, deleteInstantlyCampaign, pauseCampaign } from "@/lib/integrations/instantly";
import { syncCampaigns } from "@/lib/sync/campaigns";
import { launchBlocker } from "@/lib/campaigns/launch-gate";
import { buildLaunchChecklist } from "@/lib/campaigns/launch-checklist";
import { appConfig, integrations } from "@/lib/config";

/** First variant per step, ordered — the sequence to replicate into Instantly on push. */
function sequenceFor(campaignId: string): { subject: string; body: string }[] {
  const byStep = new Map<number, { subject: string; body: string }>();
  for (const v of getVariants().filter((v) => v.campaignId === campaignId).sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant))) {
    if (!byStep.has(v.step)) byStep.set(v.step, { subject: v.subject, body: v.body });
  }
  return [...byStep.keys()].sort((a, b) => a - b).map((k) => byStep.get(k)!);
}

function revalidate() {
  revalidatePath("/campaigns");
  revalidatePath("/");
}

export async function pauseCampaignAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const c = getCampaign(id);
  if (c?.status === "paused") return { ok: true };
  if (c?.instantlyCampaignId && integrations.instantly) {
    try { await pauseCampaign(c.instantlyCampaignId); } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  await setCampaignStatus(id, "paused", user.name);
  revalidate();
  return { ok: true };
}

/** Assemble the pre-launch checklist — the final human gate before sending starts. */
export async function launchChecklistAction(id: string) {
  await ensureData();
  const c = getCampaign(id);
  if (!c) return { ok: false as const, error: "Campaign not found.", items: [] };
  const items = buildLaunchChecklist({
    campaign: c,
    variants: getVariants(),
    leads: getLeads(),
    landing: getLandingPage(id),
    inboxes: getInboxes(),
    instantlyConnected: integrations.instantly,
    warmupGate: appConfig.deliverability.warmupGate,
  });
  return { ok: true as const, items };
}

export async function launchCampaignAction(id: string, override = false) {
  await ensureData();
  const user = await getCurrentUser();
  const c = getCampaign(id);
  if (c?.status === "active") return { ok: true as const };
  // Gate: a campaign may only go active if it can actually send (linked + inboxes) and isn't sending
  // from under-warmed inboxes. `override` forgives ONLY the warmup warning — not the can't-send blocks.
  if (c) {
    const block = launchBlocker(c, { instantlyConnected: integrations.instantly, warmupGate: appConfig.deliverability.warmupGate, inboxes: getInboxes() });
    if (block && !(override && block.reason === "warmup")) {
      return { ok: false as const, blocked: block.reason, error: block.message };
    }
  }
  if (c?.instantlyCampaignId && integrations.instantly) {
    try { await activateCampaign(c.instantlyCampaignId); } catch (e) { return { ok: false as const, error: (e as Error).message }; }
  }
  await setCampaignStatus(id, "active", user.name);
  revalidate();
  return { ok: true as const };
}

export async function cloneCampaignAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const c = await cloneCampaign(id, user.name);
  revalidate();
  return { ok: !!c, id: c?.id };
}

export async function deleteCampaignAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const c = getCampaign(id);
  if (!c) return { ok: false as const, error: "Campaign not found." };
  // Delete the linked Instantly campaign first — otherwise the next sync would just re-create the hub row.
  if (c.instantlyCampaignId && integrations.instantly) {
    try { await deleteInstantlyCampaign(c.instantlyCampaignId); } catch (e) { return { ok: false as const, error: `Couldn't delete in Instantly: ${(e as Error).message}` }; }
  }
  await deleteCampaign(id, user.name);
  revalidate();
  return { ok: true as const };
}

export async function createCampaignAction(input: {
  name: string;
  vertical: string;
  personaId: string;
  dailyCap: number;
  /** Optional authored sequence (from the launch wizard) — persisted with the new draft campaign. */
  steps?: { step: number; subject: string; body: string }[];
}) {
  await ensureData();
  const user = await getCurrentUser();
  if (!input.name.trim()) return { ok: false, error: "Campaign name is required." };
  const campaign = await addCampaign(
    {
      name: input.name.trim(),
      vertical: input.vertical.trim() || "General",
      personaId: input.personaId,
      dailyCap: Number(input.dailyCap) || 80,
    },
    user.name,
  );
  // Save the wizard's (possibly AI-edited) sequence so the work isn't lost. Non-fatal if it fails.
  if (input.steps?.length) {
    try { await seedCampaignVariants(campaign.id, input.steps, user.name); } catch { /* campaign still created */ }
  }
  revalidatePath("/campaigns");
  revalidatePath("/");
  return { ok: true, id: campaign.id };
}

/**
 * Push a hub draft to Instantly so it can actually send: create the Instantly campaign from the draft's
 * sequence + chosen inboxes, let the sync pull it back as the canonical `c_<instantlyId>` row, carry over
 * any leads already on the draft, then retire the staging draft. Returns the new campaign id to navigate to.
 * The created Instantly campaign is a DRAFT — it never auto-launches.
 */
// In-flight pushes (per instance) — a double-click/double-submit on "Push" used to create
// TWO Instantly campaigns and queue every draft lead for sending twice.
const pushing: Set<string> = ((globalThis as unknown as { __ciqPushing?: Set<string> }).__ciqPushing ??= new Set());

export async function pushCampaignToInstantlyAction(id: string, inboxIds: string[]) {
  await ensureData();
  const user = await getCurrentUser();
  if (!integrations.instantly) return { ok: false as const, error: "Instantly isn't connected." };
  const c = getCampaign(id);
  if (!c) return { ok: false as const, error: "Campaign not found." };
  if (c.instantlyCampaignId) return { ok: false as const, error: "This campaign is already on Instantly." };
  if (pushing.has(id)) return { ok: false as const, error: "This campaign is already being pushed — give it a few seconds." };
  const steps = sequenceFor(id);
  if (!steps.length) return { ok: false as const, error: "Add sequence copy before pushing to Instantly." };
  const chosen = getInboxes().filter((i) => inboxIds.includes(i.id));
  if (!chosen.length) return { ok: false as const, error: "Select at least one sending inbox." };

  pushing.add(id);
  try {
    const { id: instId } = await createInstantlyCampaign({ name: c.name, steps, inboxEmails: chosen.map((i) => i.email), dailyLimit: c.dailyCap });
    if (!instId) return { ok: false as const, error: "Instantly did not return a campaign id." };
    await syncCampaigns(); // creates the canonical c_<instId> row (draft) with sequence + inbox_ids
    const newId = `c_${instId}`;

    // VERIFY the canonical row exists before retiring anything — if Instantly's list lagged
    // (eventual consistency), reassigning leads onto a missing row silently FK-failed and the
    // draft was then half-retired. Create the row directly from the draft as the fallback.
    await ensureData();
    if (!getCampaign(newId)) {
      await upsertCanonicalCampaign({
        id: newId, name: c.name, vertical: c.vertical, personaId: c.personaId,
        instantlyCampaignId: instId, inboxIds: chosen.map((i) => i.id), dailyCap: c.dailyCap,
      });
    } else {
      // Carry the draft's authored attribution onto the canonical row — the sync derives
      // vertical/persona from name keywords, which loses what the operator actually set.
      await setCampaignAttribution(newId, c.vertical, c.personaId);
    }

    // Carry over any leads already attached to the staging draft (best-effort into Instantly; always re-attribute).
    const draftLeads = getLeads().filter((l) => l.campaignId === id);
    if (draftLeads.length) {
      try {
        await addLeadsToCampaign(instId, draftLeads.map((l) => ({ email: l.email, first_name: l.firstName, last_name: l.lastName, company_name: l.company, phone: l.phone ?? undefined, personalization: "" })));
      } catch { /* non-fatal — leads remain re-loadable from the Leads page */ }
      await reassignCampaignLeads(id, newId, user.name);
    }

    await deleteCampaign(id, user.name); // retire the staging draft; the canonical row is c_<instId>
    await pushAudit(user.name, "campaign.pushed_to_instantly", "campaign", newId, { from: id, inboxes: chosen.length, leads: draftLeads.length });
    revalidate();
    revalidatePath(`/campaigns/${newId}`);
    return { ok: true as const, id: newId, leads: draftLeads.length };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  } finally {
    pushing.delete(id);
  }
}
