"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { ensureData, pauseInbox, resumeInbox } from "@/lib/data/store";

function revalidate() {
  revalidatePath("/deliverability");
  revalidatePath("/");
}

export async function pauseInboxAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  // DB-level pause (mirrors the auto-pause guardrail); operator pauses warmup in Instantly.
  await pauseInbox(id, user.name, "manual");
  revalidate();
  return { ok: true };
}

export async function resumeInboxAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  await resumeInbox(id, user.name);
  revalidate();
  return { ok: true };
}
