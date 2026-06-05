"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { ensureData, getVariants, updateVariant } from "@/lib/data/store";
import { rewriteCopy } from "@/lib/ai/copy";

export async function updateVariantAction(id: string, subject: string, body: string) {
  await ensureData();
  const user = await getCurrentUser();
  const v = await updateVariant(id, { subject, body }, user.name);
  if (!v) return { ok: false as const, error: "Variant not found." };
  revalidatePath(`/campaigns/${v.campaignId}`);
  return { ok: true as const };
}

/** AI rewrite of a variant's copy by instruction — returns the new draft (does not save). */
export async function rewriteVariantAction(id: string, instruction: string) {
  await ensureData();
  const v = getVariants().find((x) => x.id === id);
  if (!v) return { ok: false as const, error: "Variant not found." };
  const out = await rewriteCopy({ subject: v.subject, body: v.body, instruction: instruction.trim() || "Tighten and improve this." });
  return { ok: true as const, subject: out.subject, body: out.body, source: out.source };
}
