/**
 * Decide what happens to a classified reply: draft a response (unless it's a class we
 * action rather than answer), then pick a status from the automation level.
 *
 * This is the safety-critical gate. Negatives and unsubscribes are ALWAYS suppressed —
 * never drafted, never auto-sent, regardless of automation level. OOO is snoozed. Auto-send
 * only fires when the level allows that class AND we're confident AND there's a non-empty
 * draft. Shared by the reply sync (and webhook via it) so there's one source of truth.
 */
import { draftReply } from "@/lib/ai/draft";
import { appConfig } from "@/lib/config";
import type { AutomationLevel, ReplyClass, ReplyStatus } from "@/lib/data/types";

export interface ReplyDecisionInput {
  classification: ReplyClass;
  confidence: number;
  text: string;
  fromName: string;
  lead: { firstName?: string; company?: string; vertical?: string; title?: string } | null;
  level: AutomationLevel;
}

export interface ReplyDecision {
  aiDraft: string | null;
  draftSource: "ai" | "rules" | null;
  status: ReplyStatus;
  suppress: boolean;
  isOoo: boolean;
  hot: boolean;
}

export async function decideReply(input: ReplyDecisionInput): Promise<ReplyDecision> {
  const { classification: cls, confidence, text, fromName, lead, level } = input;

  const suppress = cls === "unsubscribe" || cls === "negative";
  const isOoo = cls === "ooo";
  const autoSafe = (appConfig.autoSafeClasses as readonly string[]).includes(cls);
  const confident = confidence >= 0.85;

  let aiDraft: string | null = null;
  let draftSource: "ai" | "rules" | null = null;
  if (!suppress && !isOoo) {
    const d = await draftReply({ classification: cls, body: text, fromName }, lead);
    aiDraft = d.draft;
    draftSource = d.source;
  }

  let status: ReplyStatus = "pending";
  if (suppress) status = "suppressed";
  else if (isOoo) status = "snoozed";
  else if ((level === "auto_all" || (level === "auto_safe" && autoSafe)) && confident && (aiDraft?.trim()?.length ?? 0) > 0) {
    // Only auto-send when the level allows this class, we're confident, AND there's a draft.
    status = "auto_sent";
  }

  const hot = (appConfig.hotClasses as readonly string[]).includes(cls);
  return { aiDraft, draftSource, status, suppress, isOoo, hot };
}

export interface InboxSendState {
  status: string;
  sentToday: number;
  dailyCap: number;
}

export type InboxGateReason = "unknown_inbox" | "inactive" | "cap_reached";

/** Inbox statuses healthy enough to carry an automated reply. Allowlist (fail closed): any
 *  other value — "paused", "error", or a future status — blocks rather than silently sending. */
const SENDABLE_STATUSES = new Set(["active", "warming"]);

/**
 * Can this inbox carry an automated reply right now? Fail closed: only an active/warming inbox
 * under its daily cap may send; a paused/errored inbox (protecting domain reputation), one at
 * its cap, or one we don't track routes the reply to the human queue instead.
 */
export function inboxAutoSendGate(inbox: InboxSendState | null | undefined): { ok: boolean; reason: InboxGateReason | null } {
  if (!inbox) return { ok: false, reason: "unknown_inbox" };
  if (!SENDABLE_STATUSES.has(inbox.status)) return { ok: false, reason: "inactive" };
  if (Math.max(0, inbox.sentToday) >= inbox.dailyCap) return { ok: false, reason: "cap_reached" };
  return { ok: true, reason: null };
}
