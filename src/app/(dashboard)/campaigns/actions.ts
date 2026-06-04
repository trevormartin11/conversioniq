"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addCampaign } from "@/lib/data/store";

export async function createCampaignAction(input: {
  name: string;
  vertical: string;
  personaId: string;
  dailyCap: number;
}) {
  const user = await getCurrentUser();
  if (!input.name.trim()) return { ok: false, error: "Campaign name is required." };
  const campaign = addCampaign(
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
