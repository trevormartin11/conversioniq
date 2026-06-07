/**
 * Channel send policy — the pure, testable rules that keep outreach legal and durable:
 *   - SMS is consent-gated (TCPA): a send is allowed ONLY with an opted_in consent record.
 *   - Every channel account has a human-paced daily cap (keeps numbers/accounts unbanned).
 *
 * Kept free of I/O so the store and the tests share exactly one implementation of the gate.
 */
import type { ChannelAccount, ConsentRecord, OutreachChannel } from "@/lib/data/types";

/** Canonicalize a handle for matching. Phones → "+" + digits; social → lowercased, "@" stripped. */
export function normalizeHandle(channel: OutreachChannel, raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (channel === "sms") {
    // Canonicalize to E.164 so one real number matches across formats — a legal gate must
    // not silently miss an opt-in. US-centric: a bare 10-digit number gets +1. Anything that
    // can't be a real number (incl. a lone "+", letters, too few/many digits) → "" (blocks).
    const intl = t.startsWith("+");
    let digits = t.replace(/\D/g, "");
    if (!intl && digits.length === 10) digits = "1" + digits; // US national → +1XXXXXXXXXX
    if (digits.length < 8 || digits.length > 15) return ""; // E.164 is 8–15 digits
    return "+" + digits;
  }
  return t.replace(/^@+/, "").toLowerCase();
}

/** True when a handle is well-formed enough to store/send on a channel (SMS must be E.164). */
export function isValidHandle(channel: OutreachChannel, raw: string): boolean {
  return normalizeHandle(channel, raw) !== "";
}

/** The current consent record for a (channel, handle), most-recently-updated wins. */
export function findConsent(records: ConsentRecord[], channel: OutreachChannel, handle: string): ConsentRecord | undefined {
  const h = normalizeHandle(channel, handle);
  if (!h) return undefined;
  return records
    .filter((r) => r.channel === channel && normalizeHandle(channel, r.handle) === h)
    .sort((a, b) => (b.updatedAt || b.capturedAt).localeCompare(a.updatedAt || a.capturedAt))[0];
}

export type GateReason = "no_consent" | "opted_out" | "cap_reached" | "inactive_account";
export type SendGate = { ok: true } | { ok: false; reason: GateReason };

export const GATE_REASONS: Record<GateReason, string> = {
  no_consent: "No opt-in on file — texting a cold number violates TCPA. Capture consent first.",
  opted_out: "This contact opted out (STOP). Sending is permanently blocked.",
  cap_reached: "Daily send cap reached for this account — protects the sender. Resumes tomorrow.",
  inactive_account: "No active sending number/account for this channel.",
};

/** SMS consent gate: allowed only when an opted_in record exists for the handle. */
export function smsConsentGate(records: ConsentRecord[], handle: string): SendGate {
  const c = findConsent(records, "sms", handle);
  if (!c || c.status === "pending") return { ok: false, reason: "no_consent" };
  if (c.status === "opted_out") return { ok: false, reason: "opted_out" };
  return { ok: true };
}

/** Remaining sends today for an account (0 if missing). */
export function capRemaining(account: ChannelAccount | null | undefined): number {
  if (!account) return 0;
  return Math.max(0, account.dailyCap - account.sentToday);
}

/**
 * Full pre-send check used at the single send chokepoint. SMS runs the consent gate first
 * (legal), then every channel runs the cap + active-account check (durability).
 */
export function sendGate(channel: OutreachChannel, records: ConsentRecord[], handle: string, account: ChannelAccount | null | undefined): SendGate {
  if (channel === "sms") {
    const consent = smsConsentGate(records, handle);
    if (!consent.ok) return consent;
  }
  if (!account || account.status === "error" || account.status === "pending") return { ok: false, reason: "inactive_account" };
  if (capRemaining(account) <= 0) return { ok: false, reason: "cap_reached" };
  return { ok: true };
}
