"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createCreditRequest, decideCreditRequest, getCreditRequests, pushAudit } from "@/lib/data/store";

function revalidate() {
  revalidatePath("/credits");
  revalidatePath("/");
}

export async function requestCreditAction(amount: number, reason: string) {
  const user = await getCurrentUser();
  if (!amount || amount <= 0) return { ok: false, error: "Enter a positive amount." };
  createCreditRequest({ provider: "apollo_ciq", amount, reason: reason || "(no reason given)", requestedBy: user.name });
  revalidate();
  return { ok: true };
}

export async function approveCreditAction(id: string) {
  const user = await getCurrentUser();
  decideCreditRequest(id, "approved", user.name);
  revalidate();
  return { ok: true };
}

export async function denyCreditAction(id: string) {
  const user = await getCurrentUser();
  decideCreditRequest(id, "denied", user.name);
  revalidate();
  return { ok: true };
}

/**
 * The ONLY path that actually spends CIQ credits. Hard rule: refuses unless the
 * request exists and is approved. In live mode this is where
 * apollo.enrichWithCiqCredits(...) runs with the approval payload. Every spend
 * is audit-logged.
 */
export async function executeCreditSpendAction(id: string) {
  const user = await getCurrentUser();
  const req = getCreditRequests().find((r) => r.id === id);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "approved") return { ok: false, error: "Refused — spend must be approved first." };
  req.status = "executed";
  pushAudit(user.name, "credit.executed", "apollo_ciq", id, { amount: req.amount });
  revalidate();
  return { ok: true };
}
