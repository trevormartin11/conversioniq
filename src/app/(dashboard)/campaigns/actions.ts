"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addCampaign, cloneCampaign, ensureData, getCampaign, setCampaignStatus } from "@/lib/data/store";
import { activateCampaign, pauseCampaign } from "@/lib/integrations/instantly";
import { integrations } from "@/lib/config";

function revalidate() {
  revalidatePath("/campaigns");
  revalidatePath("/");
}

export async function pauseCampaignAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const c = getCampaign(id);
  if (c?.instantlyCampaignId && integrations.instantly) {
    try { await pauseCampaign(c.instantlyCampaignId); } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  await setCampaignStatus(id, "paused", user.name);
  revalidate();
  return { ok: true };
}

export async function launchCampaignAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const c = getCampaign(id);
  if (c?.instantlyCampaignId && integrations.instantly) {
    try { await activateCampaign(c.instantlyCampaignId); } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  await setCampaignStatus(id, "active", user.name);
  revalidate();
  return { ok: true };
}

export async function cloneCampaignAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const c = await cloneCampaign(id, user.name);
  revalidate();
  return { ok: !!c, id: c?.id };
}

export async function createCampaignAction(input: {
  name: string;
  vertical: string;
  personaId: string;
  dailyCap: number;
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
  revalidatePath("/campaigns");
  revalidatePath("/");
  return { ok: true, id: campaign.id };
}
