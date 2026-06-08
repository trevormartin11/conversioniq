"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addCampaign, cloneCampaign, deleteCampaign, ensureData, getCampaign, getInboxes, seedCampaignVariants, setCampaignStatus } from "@/lib/data/store";
import { activateCampaign, deleteInstantlyCampaign, pauseCampaign } from "@/lib/integrations/instantly";
import { appConfig, integrations } from "@/lib/config";

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

export async function launchCampaignAction(id: string, override = false) {
  await ensureData();
  const user = await getCurrentUser();
  const c = getCampaign(id);
  if (c?.status === "active") return { ok: true as const };
  // Deliverability gate: never start sending from under-warmed / inactive inboxes — that burns the fleet.
  if (c && !override) {
    const gate = appConfig.deliverability.warmupGate;
    const unfit = getInboxes().filter((i) => c.inboxIds.includes(i.id) && (i.status !== "active" || i.warmupScore < gate));
    if (unfit.length) {
      const names = unfit.slice(0, 3).map((i) => i.email).join(", ");
      return { ok: false as const, blocked: "warmup" as const, error: `${unfit.length} assigned inbox${unfit.length > 1 ? "es are" : " is"} under warmup ${gate} or not active (${names}${unfit.length > 3 ? "…" : ""}). Launching now risks the fleet.` };
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
