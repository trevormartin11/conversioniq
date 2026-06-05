"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { ensureData, updateVariant } from "@/lib/data/store";

export async function updateVariantAction(id: string, subject: string, body: string) {
  await ensureData();
  const user = await getCurrentUser();
  const v = await updateVariant(id, { subject, body }, user.name);
  if (!v) return { ok: false as const, error: "Variant not found." };
  revalidatePath(`/campaigns/${v.campaignId}`);
  return { ok: true as const };
}
