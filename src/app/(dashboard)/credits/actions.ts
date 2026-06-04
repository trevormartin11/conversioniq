"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createCreditRequest, decideCreditRequest, ensureData, executeCreditSpend, getCreditRequests } from "@/lib/data/store";

function revalidate() {
  revalidatePath("/credits");
  revalidatePath("/");
}

export async function requestCreditAction(amount: number, reason: string) {
  await ensureData();
  const user = await getCurrentUser();
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "Enter a positive whole number of credits." };
  await createCreditRequest({ provider: "apollo_ciq", amount: amt, reason: reason || "(no reason given)", requestedBy: user.name });
  revalidate();
  return { ok: true };
}

export async function approveCreditAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const req = getCreditRequests().find((r) => r.id === id);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") return { ok: false, error: "This request was already decided." };
  if (req.requestedBy === user.name) return { ok: false, error: "You can't approve your own request — a partner must approve it." };
  await decideCreditRequest(id, "approved", user.name);
  revalidate();
  return { ok: true };
}

export async function denyCreditAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const req = getCreditRequests().find((r) => r.id === id);
  if (!req || req.status !== "pending") return { ok: false, error: "This request was already decided." };
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
