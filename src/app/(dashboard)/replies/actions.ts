"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  addSuppression,
  getLead,
  getReply,
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
  const user = await getCurrentUser();
  saveReplyDraft(id, body);
  // In live mode this is where we'd POST the reply through Instantly on the
  // original thread. In mock mode we record the approval + send.
  updateReplyStatus(id, "sent", user.name);
  revalidate();
  return { ok: true };
}

export async function skipReplyAction(id: string) {
  const user = await getCurrentUser();
  updateReplyStatus(id, "skipped", user.name);
  revalidate();
  return { ok: true };
}

export async function snoozeReplyAction(id: string) {
  const user = await getCurrentUser();
  updateReplyStatus(id, "snoozed", user.name);
  revalidate();
  return { ok: true };
}

/** Negative / unsubscribe -> suppress globally + flag Zoho DNC (auto-action). */
export async function suppressFromReplyAction(id: string) {
  const user = await getCurrentUser();
  const reply = getReply(id);
  if (!reply) return { ok: false };
  const lead = getLead(reply.leadId);
  addSuppression(
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
  updateReplyStatus(id, "suppressed", user.name);
  revalidate();
  return { ok: true };
}

export async function regenerateDraftAction(id: string) {
  const reply = getReply(id);
  if (!reply) return { ok: false, draft: "" };
  const lead = getLead(reply.leadId);
  const { draft } = await draftReply(reply, lead);
  if (draft) saveReplyDraft(id, draft);
  revalidate();
  return { ok: true, draft: draft ?? "" };
}

export async function setAutomationAction(level: AutomationLevel) {
  setAutomationLevel(level);
  // Notify the team so a change in posture is visible.
  void sendTelegram(`⚙️ Reply automation set to *${level.replace("_", " ")}*.`);
  revalidate();
  return { ok: true };
}
