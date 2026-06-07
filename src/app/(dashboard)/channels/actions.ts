"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  addChannelAccount,
  addOutreach,
  approveOutreach,
  ensureData,
  getChannelAccount,
  getLead,
  getOutreachMessage,
  recordConsent,
  removeChannelAccount,
  sendOutreach,
  setConsentStatus,
  skipOutreach,
  updateChannelAccount,
  updateOutreachBody,
} from "@/lib/data/store";
import { draftChannelMessage } from "@/lib/ai/channels";
import { isValidHandle, normalizeHandle } from "@/lib/channels/policy";
import type { ChannelAccountStatus, ConsentSource, OutreachChannel, TenDlcStatus } from "@/lib/data/types";

/** Daily caps are the anti-ban chokepoint — keep them sane (1–1000). Returns null if invalid. */
function cleanCap(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : null;
}

function rev() {
  revalidatePath("/channels");
}

/** Capture an opt-in (the legal precondition for SMS). Records the evidence trail. */
export async function captureConsentAction(input: { channel: OutreachChannel; handle: string; source: ConsentSource; proof?: string; leadId?: string }) {
  await ensureData();
  const user = await getCurrentUser();
  if (!input.handle.trim()) return { ok: false as const, error: "Enter a phone number or handle." };
  if (input.channel === "sms" && !isValidHandle("sms", input.handle)) return { ok: false as const, error: "Enter a valid phone number, e.g. +14155550123." };
  const rec = await recordConsent(
    { channel: input.channel, handle: input.handle, source: input.source, proof: input.proof?.trim() || null, leadId: input.leadId ?? null, status: "opted_in" },
    user.name,
  );
  rev();
  return { ok: true as const, id: rec.id };
}

/** Record an opt-out (STOP). Permanently blocks future sends to the handle. */
export async function optOutAction(channel: OutreachChannel, handle: string) {
  await ensureData();
  const user = await getCurrentUser();
  if (!handle.trim()) return { ok: false as const, error: "Missing handle." };
  await setConsentStatus(channel, handle, "opted_out", user.name, "manual");
  rev();
  return { ok: true as const };
}

/** AI-draft a new message and queue it. SMS auto-parks in needs_consent if there's no opt-in. */
export async function draftOutreachAction(input: {
  channel: OutreachChannel;
  leadId?: string;
  toName?: string;
  toHandle: string;
  angle?: string;
  signal?: string;
  profileUrl?: string;
}) {
  await ensureData();
  const user = await getCurrentUser();
  if (!input.toHandle.trim()) return { ok: false as const, error: "A destination (phone / handle) is required." };
  if (input.channel === "sms" && !isValidHandle("sms", input.toHandle)) return { ok: false as const, error: "Enter a valid phone number, e.g. +14155550123." };
  const lead = input.leadId ? getLead(input.leadId) : null;
  const draft = await draftChannelMessage({
    channel: input.channel,
    firstName: lead?.firstName ?? (input.toName?.trim().split(/\s+/)[0] ?? ""),
    company: lead?.company ?? "",
    title: lead?.title,
    vertical: lead?.vertical,
    angle: input.angle?.trim() || undefined,
    signal: input.signal?.trim() || undefined,
  });
  const msg = await addOutreach(
    {
      channel: input.channel,
      leadId: input.leadId ?? null,
      toName: input.toName?.trim() || (lead ? `${lead.firstName} ${lead.lastName}` : input.toHandle.trim()),
      toHandle: input.toHandle,
      body: draft.body,
      source: draft.source,
      rationale: draft.rationale,
      profileUrl: input.profileUrl?.trim() || null,
    },
    user.name,
  );
  rev();
  return { ok: true as const, id: msg.id, status: msg.status, source: draft.source };
}

/** Regenerate the AI copy for an existing queued message (keeps it in place). */
export async function regenerateOutreachAction(id: string, angle?: string) {
  await ensureData();
  const user = await getCurrentUser();
  const m = getOutreachMessage(id);
  if (!m) return { ok: false as const, error: "Message not found." };
  const lead = m.leadId ? getLead(m.leadId) : null;
  const draft = await draftChannelMessage({
    channel: m.channel,
    firstName: lead?.firstName ?? m.toName.split(/\s+/)[0],
    company: lead?.company ?? "",
    title: lead?.title,
    vertical: lead?.vertical,
    angle: angle?.trim() || undefined,
  });
  await updateOutreachBody(id, draft.body, user.name);
  rev();
  return { ok: true as const, body: draft.body, source: draft.source };
}

export async function saveOutreachBodyAction(id: string, body: string) {
  await ensureData();
  const user = await getCurrentUser();
  const m = await updateOutreachBody(id, body, user.name);
  rev();
  return m ? { ok: true as const } : { ok: false as const, error: "Message not found." };
}

export async function approveOutreachAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const r = await approveOutreach(id, user.name);
  rev();
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function sendOutreachAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const r = await sendOutreach(id, user.name);
  rev();
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function skipOutreachAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  await skipOutreach(id, user.name);
  rev();
  return { ok: true as const };
}

// --- sending-account setup --------------------------------------------------

/** Register a sending identity (SMS number / social account) so a channel can send. */
export async function addChannelAccountAction(input: {
  channel: OutreachChannel;
  label: string;
  identifier: string;
  dailyCap: number;
  status?: ChannelAccountStatus;
  tenDlc?: TenDlcStatus;
  provider?: string;
  note?: string;
}) {
  await ensureData();
  const user = await getCurrentUser();
  if (!input.label.trim()) return { ok: false as const, error: "Give the account a label." };
  if (!input.identifier.trim()) return { ok: false as const, error: input.channel === "sms" ? "Enter the phone number." : "Enter the account handle." };
  if (input.channel === "sms" && !isValidHandle("sms", input.identifier)) return { ok: false as const, error: "Enter a valid phone number, e.g. +14155550123." };
  const cap = cleanCap(input.dailyCap);
  if (cap == null) return { ok: false as const, error: "Daily cap must be between 1 and 1000." };
  const identifier = input.channel === "sms" ? normalizeHandle("sms", input.identifier) : input.identifier.trim();
  const acct = await addChannelAccount(
    { channel: input.channel, label: input.label.trim(), identifier, dailyCap: cap, status: input.status, tenDlc: input.tenDlc, provider: input.provider?.trim() || undefined, note: input.note?.trim() || null },
    user.name,
  );
  rev();
  return { ok: true as const, id: acct.id };
}

/** Edit a sending account (cap, status, 10DLC, label, note). */
export async function updateChannelAccountAction(
  id: string,
  patch: { label?: string; identifier?: string; dailyCap?: number; status?: ChannelAccountStatus; tenDlc?: TenDlcStatus; note?: string },
) {
  await ensureData();
  const user = await getCurrentUser();
  const existing = getChannelAccount(id);
  if (!existing) return { ok: false as const, error: "Account not found." };
  const clean: Parameters<typeof updateChannelAccount>[1] = {};
  if (patch.label !== undefined) {
    if (!patch.label.trim()) return { ok: false as const, error: "Label can't be empty." };
    clean.label = patch.label.trim();
  }
  if (patch.identifier !== undefined) {
    if (existing.channel === "sms" && !isValidHandle("sms", patch.identifier)) return { ok: false as const, error: "Enter a valid phone number, e.g. +14155550123." };
    clean.identifier = existing.channel === "sms" ? normalizeHandle("sms", patch.identifier) : patch.identifier.trim();
  }
  if (patch.dailyCap !== undefined) {
    const cap = cleanCap(patch.dailyCap);
    if (cap == null) return { ok: false as const, error: "Daily cap must be between 1 and 1000." };
    clean.dailyCap = cap;
  }
  if (patch.status !== undefined) clean.status = patch.status;
  if (patch.tenDlc !== undefined) clean.tenDlc = patch.tenDlc;
  if (patch.note !== undefined) clean.note = patch.note.trim() || null;
  await updateChannelAccount(id, clean, user.name);
  rev();
  return { ok: true as const };
}

export async function removeChannelAccountAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  const ok = await removeChannelAccount(id, user.name);
  rev();
  return ok ? { ok: true as const } : { ok: false as const, error: "Account not found." };
}
