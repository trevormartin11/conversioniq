"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addDemo, ensureData, getLead, updateDemo } from "@/lib/data/store";
import type { DemoStatus } from "@/lib/data/types";

function revalidate() {
  revalidatePath("/pipeline");
  revalidatePath("/");
}

export async function bookDemoAction(input: { leadId: string; scheduledAt?: string }) {
  await ensureData();
  const user = await getCurrentUser();
  if (!getLead(input.leadId)) return { ok: false as const, error: "Lead not found." };
  await addDemo(
    { leadId: input.leadId, scheduledAt: input.scheduledAt || new Date(Date.now() + 3 * 864e5).toISOString(), owner: user.name },
    user.name,
  );
  revalidate();
  return { ok: true as const };
}

export async function updateDemoAction(id: string, status: DemoStatus, mrr?: number) {
  await ensureData();
  const user = await getCurrentUser();
  const demo = await updateDemo(
    id,
    { status, mrr: status === "closed" ? Math.max(0, Math.round(mrr ?? 0)) : undefined },
    user.name,
  );
  if (!demo) return { ok: false as const, error: "Demo not found." };
  revalidate();
  return { ok: true as const };
}
