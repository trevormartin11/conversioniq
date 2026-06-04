"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createCreditRequest, decideCreditRequest, ensureData, executeCreditSpend } from "@/lib/data/store";

function revalidate() {
  revalidatePath("/credits");
  revalidatePath("/");
}

export async function requestCreditAction(amount: number, reason: string) {
  await ensureData();
  const user = await getCurrentUser();
  if (!amount || amount <= 0) return { ok: false, error: "Enter a positive amount." };
  await createCreditRequest({ provider: "apollo_ciq", amount, reason: reason || "(no reason given)", requestedBy: user.name });
  revalidate();
  return { ok: true };
}

export async function approveCreditAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  await decideCreditRequest(id, "approved", user.name);
  revalidate();
  return { ok: true };
}

export async function denyCreditAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  await decideCreditRequest(id, "denied", user.name);
  revalidate();
  return { ok: true };
}

/**
 * The ONLY path that spends CIQ credits. Refuses unless the request is approved.
 * Live: this is where apollo.enrichWithCiqCredits(...) runs with the approval.
 */
export async function executeCreditSpendAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const res = await executeCreditSpend(id, user.name);
  if (!res) return { ok: false, error: "Refused — spend must be approved first." };
  revalidate();
  return { ok: true };
}
