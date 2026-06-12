"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  addDemo,
  addSuppression,
  claimReply,
  ensureData,
  getInbox,
  getLead,
  getReply,
  pushAudit,
  releaseReplyClaim,
  revertReplyToPending,
  saveReplyDraft,
  setAutomationLevel,
  setLeadStatus,
  updateReplyStatus,
} from "@/lib/data/store";
import { draftReply } from "@/lib/ai/draft";
import { addToBlocklist, replyToEmail } from "@/lib/integrations/instantly";
import { setDoNotContact } from "@/lib/integrations/zoho";
import { sendTelegram } from "@/lib/integrations/telegram";
import { integrations } from "@/lib/config";
import type { AutomationLevel } from "@/lib/data/types";

function revalidate() {
  revalidatePath("/replies");
  revalidatePath("/");
}

export async function approveAndSendAction(id: string, body: string) {
  await ensureData();
  const user = await getCurrentUser();
  const reply = getReply(id);
  if (!reply) return { ok: false as const, error: "Reply not found." };
  if (reply.status !== "pending") return { ok: false as const, error: "Already handled — refresh to see the latest queue." };
  if (!body.trim()) return { ok: false as const, error: "Write a reply before sending." };
  await saveReplyDraft(id, body);
  // Claim BEFORE the send (conditional DB flip to "sent" only while still pending): a
  // double-click, second tab, or post-blip retry loses the claim and can't email twice.
  const claimed = await claimReply(id, user.name);
  if (!claimed) return { ok: false as const, error: "Already handled (just now) — refresh." };
  if (integrations.instantly && reply.instantlyEmailId) {
    const inbox = getInbox(reply.inboxId);
    const subject = reply.subject?.toLowerCase().startsWith("re:") ? reply.subject : `Re: ${reply.subject ?? ""}`.trim();
    try {
      await replyToEmail({ replyToUuid: reply.instantlyEmailId, eaccount: inbox?.email ?? "", subject, bodyText: body });
    } catch (e) {
      await releaseReplyClaim(id); // claimed but nothing went out — return it to the queue
      return { ok: false as const, error: `Send failed: ${(e as Error).message}` };
    }
  }
  await pushAudit(user.name, "reply.sent", "reply", id, { lead: reply.fromName });
  revalidate();
  return { ok: true as const };
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
  // Canonical DNC: write to Zoho (source of truth) + Instantly's sending blocklist.
  if (integrations.zoho && lead?.zohoLeadId) {
    try { await setDoNotContact(lead.zohoLeadId); } catch { /* suppression already recorded in-hub */ }
  }
  if (integrations.instantly) {
    try { await addToBlocklist([reply.fromEmail]); } catch { /* best-effort sending-layer block */ }
  }
  if (lead) await setLeadStatus(lead.id, "lost", user.name);
  await updateReplyStatus(id, "suppressed", user.name);
  revalidate();
  return { ok: true as const };
}

export async function bookDemoFromReplyAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const reply = getReply(id);
  if (!reply) return { ok: false as const, error: "Reply not found." };
  await addDemo(
    { leadId: reply.leadId, scheduledAt: new Date(Date.now() + 3 * 864e5).toISOString(), owner: user.name },
    user.name,
  );
  revalidate();
  return { ok: true as const };
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
