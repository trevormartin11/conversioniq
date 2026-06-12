/**
 * Send reconciler — closes the ONE accepted residual from the invariant sweep (Outcome 3).
 * Every send path claims in the DB BEFORE calling the provider (that's what makes double-sends
 * impossible), which leaves a narrow crash window where a row says sent/auto_sent but no
 * message ever left — silently. This job diffs the hub's claims against what the providers
 * ACTUALLY sent, in BOTH directions:
 *
 *   ORPHAN  — hub says sent, provider has no trace  → revert to the human queue + alert.
 *   GHOST   — provider sent it, hub says pending     → mark sent + alert (a retry from the
 *             queue would otherwise double-email the prospect).
 *
 * Verification is fail-safe toward "unknown": a reply whose thread can't be located in the
 * unibox window is reported as unverifiable, NEVER reverted — a false orphan would invite a
 * duplicate send, which is the exact catastrophe the claims exist to prevent.
 */
import { listAllEmails, type InstantlyEmail } from "@/lib/integrations/instantly";
import { smsExistsTo } from "@/lib/integrations/twilio";
import { supabaseAdmin } from "@/lib/data/supabase";
import { sendTelegram, tgEscape } from "@/lib/integrations/telegram";
import { integrations } from "@/lib/config";

/** Rows newer than this are presumed in-flight — a send mid-await must not be "reconciled". */
export const GRACE_MS = 30 * 60 * 1000;
/** How far back claims are re-checked; older history was either verified already or is stale. */
export const LOOKBACK_MS = 48 * 60 * 60 * 1000;
/** The provider may stamp the message slightly before our handled_at — allow slack. */
const TIMESTAMP_SLACK_MS = 10 * 60 * 1000;

export interface EmailClaim {
  id: string;
  status: string;
  inboxEmail: string | null;
  instantlyEmailId: string | null;
  handledAt: string | null;
  receivedAt: string | null;
}

export interface EmailVerification {
  verified: string[];
  orphans: string[];
  unverifiable: string[];
}

/**
 * Pure core: which claimed-sent replies have a matching OUTBOUND email in their thread?
 * Match = an email in the inbound message's thread, sent FROM our inbox, stamped no earlier
 * than handled_at minus slack.
 */
export function verifyEmailClaims(claims: EmailClaim[], unibox: InstantlyEmail[], now = Date.now(), slackMs = TIMESTAMP_SLACK_MS): EmailVerification {
  const byId = new Map(unibox.map((e) => [e.id, e]));
  const byThread = new Map<string, InstantlyEmail[]>();
  for (const e of unibox) {
    if (!e.thread_id) continue;
    const arr = byThread.get(e.thread_id) ?? [];
    arr.push(e);
    byThread.set(e.thread_id, arr);
  }

  const out: EmailVerification = { verified: [], orphans: [], unverifiable: [] };
  for (const c of claims) {
    const handledAt = c.handledAt ? new Date(c.handledAt).getTime() : NaN;
    if (!Number.isFinite(handledAt) || now - handledAt < GRACE_MS) continue; // in-flight / unknown age
    const inbound = c.instantlyEmailId ? byId.get(c.instantlyEmailId) : undefined;
    if (!inbound?.thread_id) {
      out.unverifiable.push(c.id); // can't locate the thread — NEVER treat as orphan
      continue;
    }
    const ourInbox = (c.inboxEmail ?? inbound.eaccount ?? "").toLowerCase();
    if (!ourInbox) {
      out.unverifiable.push(c.id); // can't even establish which inbox sent — never an orphan
      continue;
    }
    // Lower bound: the answer must postdate BOTH the handling claim (minus provider skew) AND
    // the prospect's inbound itself — otherwise the original cold email (a fast replier puts it
    // inside the slack window) or our answer to an EARLIER sibling reply false-verifies a
    // crashed claim, hiding a real orphan. STRICT on receivedAt: an instant auto-reply (OOO)
    // lands in the SAME second as the cold send, and >= would count the cold email itself as
    // the answer. A real answer always postdates the inbound (classify → claim → send).
    const receivedAt = c.receivedAt ? new Date(c.receivedAt).getTime() : NaN;
    const lowerBound = Math.max(handledAt - slackMs, Number.isFinite(receivedAt) ? receivedAt : -Infinity);
    const outbound = (byThread.get(inbound.thread_id) ?? []).some((e) => {
      if (e.id === inbound.id) return false;
      if ((e.from_address_email ?? "").toLowerCase() !== ourInbox) return false;
      const t = e.timestamp_email ? new Date(e.timestamp_email).getTime() : NaN;
      return Number.isFinite(t) && t >= lowerBound && (!Number.isFinite(receivedAt) || t > receivedAt);
    });
    (outbound ? out.verified : out.orphans).push(c.id);
  }
  return out;
}

/** Pure core: pending replies whose thread ALREADY contains our outbound answer (the rollback
 *  fired after an ambiguous provider success) — these must be marked sent, or a human retry
 *  from the queue double-emails the prospect.
 *
 *  CRITICAL: only outbound STRICTLY AFTER the prospect's inbound counts (slack 0). The thread
 *  always contains earlier outbound — the campaign's own cold emails — and matching those
 *  would mark every pending reply "sent" and silently empty the queue. */
export function findGhostPending(pending: EmailClaim[], unibox: InstantlyEmail[], now = Date.now()): string[] {
  const byId = new Map(unibox.map((e) => [e.id, e]));
  const byThread = new Map<string, InstantlyEmail[]>();
  for (const e of unibox) {
    if (!e.thread_id) continue;
    const arr = byThread.get(e.thread_id) ?? [];
    arr.push(e);
    byThread.set(e.thread_id, arr);
  }

  const ghosts: string[] = [];
  for (const p of pending) {
    const receivedAt = p.receivedAt ? new Date(p.receivedAt).getTime() : NaN;
    if (!Number.isFinite(receivedAt) || now - receivedAt < GRACE_MS) continue; // unanchorable / human may be answering
    const inbound = p.instantlyEmailId ? byId.get(p.instantlyEmailId) : undefined;
    if (!inbound?.thread_id) continue; // unverifiable → never a ghost
    const ourInbox = (p.inboxEmail ?? inbound.eaccount ?? "").toLowerCase();
    if (!ourInbox) continue;
    const thread = byThread.get(inbound.thread_id) ?? [];
    // Upper bound: the prospect's NEXT message after this one. An answer sent after a LATER
    // sibling reply belongs to that sibling — counting it here would silently close an
    // earlier, genuinely-unanswered pending question.
    const nextInbound = Math.min(
      ...thread
        .filter((e) => e.id !== inbound.id && (e.from_address_email ?? "").toLowerCase() !== ourInbox)
        .map((e) => (e.timestamp_email ? new Date(e.timestamp_email).getTime() : NaN))
        .filter((t) => Number.isFinite(t) && t > receivedAt),
      Infinity,
    );
    const answered = thread.some((e) => {
      if (e.id === inbound.id) return false;
      if ((e.from_address_email ?? "").toLowerCase() !== ourInbox) return false;
      const t = e.timestamp_email ? new Date(e.timestamp_email).getTime() : NaN;
      // STRICT lower bound (matches the contract above): an outbound stamped in the same
      // second as this inbound answers something EARLIER — ghost-marking off it would
      // silently close a reply that was never answered.
      return Number.isFinite(t) && t > receivedAt && t < nextInbound;
    });
    if (answered) ghosts.push(p.id);
  }
  return ghosts;
}

export interface ReconcileResult {
  checked: number;
  orphans: number;
  ghosts: number;
  unverifiable: number;
  smsChecked: number;
  smsOrphans: number;
}

export async function reconcileSends(): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, orphans: 0, ghosts: 0, unverifiable: 0, smsChecked: 0, smsOrphans: 0 };
  if (!integrations.supabase) return result;
  const db = supabaseAdmin();
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  // ---- email replies (Instantly) ------------------------------------------------
  if (integrations.instantly) {
    const { data: claimedRows, error: cErr } = await db
      .from("replies")
      .select("id, status, instantly_email_id, handled_at, received_at, inboxes(email)")
      .in("status", ["sent", "auto_sent"])
      .gte("handled_at", since);
    if (cErr) throw new Error(`reconcile: replies read failed: ${cErr.message}`);
    const { data: pendingRows, error: pErr } = await db
      .from("replies")
      .select("id, status, instantly_email_id, handled_at, received_at, inboxes(email)")
      .eq("status", "pending")
      .gte("received_at", since);
    if (pErr) throw new Error(`reconcile: pending read failed: ${pErr.message}`);

    type Row = { id: string; status: string; instantly_email_id: string | null; handled_at: string | null; received_at: string | null; inboxes: { email: string } | { email: string }[] | null };
    const toClaim = (r: Row): EmailClaim => ({
      id: r.id,
      status: r.status,
      instantlyEmailId: r.instantly_email_id,
      handledAt: r.handled_at,
      receivedAt: r.received_at,
      inboxEmail: Array.isArray(r.inboxes) ? r.inboxes[0]?.email ?? null : r.inboxes?.email ?? null,
    });
    const claims = ((claimedRows ?? []) as Row[]).map(toClaim);
    const pending = ((pendingRows ?? []) as Row[]).map(toClaim);
    result.checked = claims.length;

    if (claims.length || pending.length) {
      const unibox = await listAllEmails(2000);
      const { orphans, unverifiable } = verifyEmailClaims(claims, unibox);
      result.unverifiable = unverifiable.length;

      // CIRCUIT BREAKER: a mass of "orphans" is far more likely a provider/format change than
      // dozens of independent crash windows — reverting them all would flood the queue and
      // invite duplicate sends. Alert instead of acting.
      const breaker = orphans.length > Math.max(5, Math.ceil(claims.length * 0.2));
      if (breaker) {
        await sendTelegram(tgEscape(`🚨 Send reconciler found ${orphans.length}/${claims.length} claimed-sent replies with no trace — too many to be crash windows. NOT auto-reverting; investigate the Instantly thread matching before trusting these.`));
      } else {
        const claimById = new Map(claims.map((c) => [c.id, c]));
        for (const id of orphans) {
          // Claimed sent, nothing in the thread — back to the human queue, loudly. The
          // handled_at compare-and-swap pins the exact claim we verified, so a stale verdict
          // from an overlapping run can't revert a row that was legitimately re-sent since.
          const { error } = await db
            .from("replies")
            .update({ status: "pending", handled_by: null, handled_at: null })
            .eq("id", id)
            .in("status", ["sent", "auto_sent"])
            .eq("handled_at", claimById.get(id)!.handledAt);
          if (error) throw new Error(`reconcile: orphan revert failed for ${id}: ${error.message}`);
          result.orphans++;
        }
      }
      for (const id of findGhostPending(pending, unibox)) {
        // Our answer IS in the thread but the row says pending — a retry would double-email.
        const { error } = await db.from("replies").update({ status: "sent", handled_by: "reconciler", handled_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
        if (error) throw new Error(`reconcile: ghost mark failed for ${id}: ${error.message}`);
        result.ghosts++;
      }
    }
  }

  // ---- SMS (Twilio) --------------------------------------------------------------
  if (integrations.twilio) {
    const { data: smsRows, error: sErr } = await db
      .from("outreach_messages")
      .select("id, to_handle, sent_at")
      .eq("channel", "sms")
      .eq("status", "sent")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(50);
    if (sErr) throw new Error(`reconcile: sms read failed: ${sErr.message}`);
    for (const m of (smsRows ?? []) as { id: string; to_handle: string; sent_at: string | null }[]) {
      if (!m.sent_at || Date.now() - new Date(m.sent_at).getTime() < GRACE_MS) continue;
      result.smsChecked++;
      const exists = await smsExistsTo(m.to_handle, new Date(new Date(m.sent_at).getTime() - TIMESTAMP_SLACK_MS).toISOString());
      if (exists === false) {
        // Twilio has no trace — back to approved (its pre-claim state) for an operator retry.
        const { error } = await db.from("outreach_messages").update({ status: "approved", sent_at: null, sent_by: null }).eq("id", m.id).eq("status", "sent");
        if (error) throw new Error(`reconcile: sms revert failed for ${m.id}: ${error.message}`);
        result.smsOrphans++;
      }
      // exists === null → unverifiable: leave untouched.
    }
  }

  if (result.orphans || result.ghosts || result.smsOrphans) {
    await sendTelegram(
      tgEscape(
        `🔎 Send reconciler: ${result.orphans} repl${result.orphans === 1 ? "y" : "ies"} claimed sent but never left (returned to the queue), ` +
          `${result.ghosts} actually-sent repl${result.ghosts === 1 ? "y" : "ies"} corrected to sent, ` +
          `${result.smsOrphans} SMS reverted for retry${result.unverifiable ? ` (${result.unverifiable} unverifiable — outside the unibox window)` : ""}. Review the Replies queue.`,
      ),
    );
  }
  return result;
}
