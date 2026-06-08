"use server";

import { revalidatePath } from "next/cache";
import { ensureData, setIcp } from "@/lib/data/store";
import { getCurrentUser } from "@/lib/auth";

/** Save (or, with empty text, clear back to the default) the ICP that the strategy AI reads from. */
export async function setIcpAction(text: string) {
  await ensureData();
  const user = await getCurrentUser();
  const saved = await setIcp(text, user.name);
  revalidatePath("/strategy");
  revalidatePath("/launch");
  return { ok: true as const, custom: saved !== null };
}
