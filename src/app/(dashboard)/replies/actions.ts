"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  addSuppression,
  ensureData,
  getLead,
  getReply,
  revertReplyToPending,
  saveReplyDraft,
  setAutomationLevel,
  updateReplyStatus,
} from "@/lib/data/store";
import { draftReply } from "@/lib/ai/draft";
import { sendTelegram } from "@/lib/integrations/telegram";
import type { AutomationLevel } from "@/lib/data/types";

function revalidate() {
  revalidatePath("/replies");
  revalidatePath("/");
}

export async function approveAndSendAction(id: string, body: string) {
  await ensureData();
  const user = await getCurrentUser();
  await saveReplyDraft(id, body);
  // Live: POST the reply through Instantly on the original thread here.
  await updateReplyStatus(id, "sent", user.name);
  revalidate();
  return { ok: true };
}

export async function skipReplyAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  await updateReplyStatus(id, "skipped", user.name);
  revalidate();
  return { ok: true };
}

export async function snoozeReplyAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  await updateReplyStatus(id, "snoozed", user.name);
  revalidate();
  return { ok: true };
}

export async function suppressFromReplyAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const reply = getReply(id);
  if (!reply) return { ok: false };
  const lead = getLead(reply.leadId);
  await addSuppression(
    {
      email: reply.fromEmail,
      domain: null,
      reason: reply.classification === "unsubscribe" ? "unsubscribed" : "dnc",
      source: `reply:${id}`,
      leadId: reply.leadId,
      note: `Suppressed from reply by ${user.name}`,
    },
    user.name,
  );
  // Live: zoho.setDoNotContact(lead.zohoLeadId) — canonical DNC write.
  void lead;
  await updateReplyStatus(id, "suppressed", user.name);
  revalidate();
  return { ok: true };
}

export async function revertReplyAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  await revertReplyToPending(id, user.name);
  revalidate();
  return { ok: true };
}

export async function regenerateDraftAction(id: string) {
  await ensureData();
  const reply = getReply(id);
  if (!reply) return { ok: false, draft: "" };
  const lead = getLead(reply.leadId);
  const { draft } = await draftReply(reply, lead);
  if (draft) await saveReplyDraft(id, draft);
  revalidate();
  return { ok: true, draft: draft ?? "" };
}

export async function setAutomationAction(level: AutomationLevel) {
  await ensureData();
  await setAutomationLevel(level);
  void sendTelegram(`⚙️ Reply automation set to *${level.replace("_", " ")}*.`);
  revalidate();
  return { ok: true };
}
