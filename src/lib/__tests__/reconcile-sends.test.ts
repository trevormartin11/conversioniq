import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The send reconciler closes the invariant sweep's one accepted residual: claim-before-send
 * crash windows. These tests pin its three safety-critical properties:
 *   1. an orphan (claimed sent, no outbound in the thread) is detected and reverted;
 *   2. a ghost (outbound exists, row says pending) is detected — but ONLY from outbound sent
 *      AFTER the prospect's inbound, never from the campaign's own earlier sequence emails
 *      (which would otherwise mark every pending reply "sent" and empty the queue);
 *   3. anything unverifiable is left untouched — false orphans invite the exact double-send
 *      the claims exist to prevent.
 */

import { verifyEmailClaims, findGhostPending, GRACE_MS, type EmailClaim } from "@/lib/jobs/reconcile-sends";
import type { InstantlyEmail } from "@/lib/integrations/instantly";

const NOW = new Date("2026-06-13T12:00:00Z").getTime();
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

const claim = (over: Partial<EmailClaim>): EmailClaim => ({
  id: "i_r1", status: "sent", inboxEmail: "us@ciqsends.com", instantlyEmailId: "e_in",
  handledAt: ago(120), receivedAt: ago(180), ...over,
});
const email = (over: Partial<InstantlyEmail> & { id: string }): InstantlyEmail => ({
  thread_id: "t1", eaccount: "us@ciqsends.com", ...over,
});

describe("verifyEmailClaims — claimed-sent vs the actual thread", () => {
  const inbound = email({ id: "e_in", from_address_email: "prospect@spa.com", timestamp_email: ago(180) });

  it("verifies a claim whose thread contains our outbound after handling", () => {
    const ourReply = email({ id: "e_out", from_address_email: "us@ciqsends.com", timestamp_email: ago(115) });
    const res = verifyEmailClaims([claim({})], [inbound, ourReply], NOW);
    expect(res.verified).toEqual(["i_r1"]);
    expect(res.orphans).toEqual([]);
  });

  it("flags an ORPHAN when the thread has no outbound after handling", () => {
    // Only the campaign's earlier cold email exists — sent long before handling.
    const earlier = email({ id: "e_seq", from_address_email: "us@ciqsends.com", timestamp_email: ago(600) });
    const res = verifyEmailClaims([claim({})], [inbound, earlier], NOW);
    expect(res.orphans).toEqual(["i_r1"]);
  });

  it("treats a missing inbound/thread as UNVERIFIABLE — never an orphan", () => {
    const res = verifyEmailClaims([claim({ instantlyEmailId: "e_unknown" })], [inbound], NOW);
    expect(res.orphans).toEqual([]);
    expect(res.unverifiable).toEqual(["i_r1"]);
  });

  it("skips claims inside the grace window (a send may be mid-flight)", () => {
    const res = verifyEmailClaims([claim({ handledAt: new Date(NOW - GRACE_MS / 2).toISOString() })], [inbound], NOW);
    expect(res.orphans).toEqual([]);
    expect(res.verified).toEqual([]);
    expect(res.unverifiable).toEqual([]);
  });

  it("does NOT verify off the original cold email when the prospect replied fast (P1 regression)", () => {
    // Cold email at T-8min, reply at T-5min, claim at T-4min... wait — anchor on real bug:
    // outbound BEFORE the inbound must never verify, even inside the handledAt slack window.
    const fastInbound = email({ id: "e_in3", thread_id: "t3", from_address_email: "p3@spa.com", timestamp_email: ago(125) });
    const coldEmail = email({ id: "e_cold3", thread_id: "t3", from_address_email: "us@ciqsends.com", timestamp_email: ago(128) }); // 3min before the reply, inside the 10min slack of handledAt
    const res = verifyEmailClaims(
      [claim({ id: "i_r3", instantlyEmailId: "e_in3", receivedAt: ago(125), handledAt: ago(124) })],
      [fastInbound, coldEmail],
      NOW,
    );
    expect(res.orphans).toEqual(["i_r3"]); // the cold email is not our answer
  });

  it("does NOT verify off our answer to an EARLIER sibling reply (P1 regression)", () => {
    // Reply #1 at T-180 answered at T-115; reply #2 at T-118 claimed at T-112 then crashed.
    const in1 = email({ id: "e_in", from_address_email: "prospect@spa.com", timestamp_email: ago(180) });
    const answer1 = email({ id: "e_a1", from_address_email: "us@ciqsends.com", timestamp_email: ago(119) });
    const in2 = email({ id: "e_in2b", from_address_email: "prospect@spa.com", timestamp_email: ago(118) });
    const res = verifyEmailClaims(
      [claim({ id: "i_r2b", instantlyEmailId: "e_in2b", receivedAt: ago(118), handledAt: ago(112) })],
      [in1, answer1, in2],
      NOW,
    );
    expect(res.orphans).toEqual(["i_r2b"]); // answer1 predates reply #2 — not its answer
  });

  it("does NOT verify off a cold send in the SAME second as an instant auto-reply (tie regression)", () => {
    // OOO auto-replies land in the same second as the cold send that triggered them — same
    // timestamp at Instantly's granularity. The cold email must not count as our answer.
    const autoReply = email({ id: "e_in4", thread_id: "t4", from_address_email: "p4@spa.com", timestamp_email: ago(125) });
    const coldEmail = email({ id: "e_cold4", thread_id: "t4", from_address_email: "us@ciqsends.com", timestamp_email: ago(125) });
    const res = verifyEmailClaims(
      [claim({ id: "i_r4", instantlyEmailId: "e_in4", receivedAt: ago(125), handledAt: ago(124) })],
      [autoReply, coldEmail],
      NOW,
    );
    expect(res.orphans).toEqual(["i_r4"]); // a real answer always postdates the inbound
  });

  it("ignores outbound from a different inbox (not our send)", () => {
    const other = email({ id: "e_other", from_address_email: "someoneelse@x.com", timestamp_email: ago(60) });
    const res = verifyEmailClaims([claim({})], [inbound, other], NOW);
    expect(res.orphans).toEqual(["i_r1"]);
  });
});

describe("findGhostPending — actually-sent rows stuck on pending", () => {
  const inbound = email({ id: "e_in", from_address_email: "prospect@spa.com", timestamp_email: ago(180) });

  it("detects a ghost: our outbound exists AFTER the prospect's inbound", () => {
    const ourReply = email({ id: "e_out", from_address_email: "us@ciqsends.com", timestamp_email: ago(90) });
    const ghosts = findGhostPending([claim({ status: "pending", handledAt: null })], [inbound, ourReply], NOW);
    expect(ghosts).toEqual(["i_r1"]);
  });

  it("NEVER marks a pending reply sent from the campaign's earlier sequence emails", () => {
    // The catastrophic false positive: every reply thread contains the cold email that
    // prompted it. That prior outbound must not count.
    const coldEmail = email({ id: "e_cold", from_address_email: "us@ciqsends.com", timestamp_email: ago(600) });
    const ghosts = findGhostPending([claim({ status: "pending", handledAt: null })], [inbound, coldEmail], NOW);
    expect(ghosts).toEqual([]);
  });

  it("does NOT ghost-mark an earlier pending reply off our answer to a LATER sibling (P1 regression)", () => {
    // Pending reply #1 at T-180 (never answered); reply #2 at T-120; we answered #2 at T-90.
    const in1 = email({ id: "e_in", from_address_email: "prospect@spa.com", timestamp_email: ago(180) });
    const in2 = email({ id: "e_in2c", from_address_email: "prospect@spa.com", timestamp_email: ago(120) });
    const answer2 = email({ id: "e_a2", from_address_email: "us@ciqsends.com", timestamp_email: ago(90) });
    const ghosts = findGhostPending(
      [claim({ id: "i_r1", status: "pending", handledAt: null, instantlyEmailId: "e_in", receivedAt: ago(180) })],
      [in1, in2, answer2],
      NOW,
    );
    expect(ghosts).toEqual([]); // the answer belongs to reply #2's window, not #1's
  });

  it("does NOT ghost-mark off an outbound in the SAME second as the inbound (tie regression)", () => {
    // An outbound stamped in the same second as the prospect's inbound answers something
    // EARLIER (a real answer takes minutes: classify → claim → send) — counting it would
    // silently mark an unanswered reply sent and drop it from the queue.
    const in5 = email({ id: "e_in5", thread_id: "t5", from_address_email: "p5@spa.com", timestamp_email: ago(180) });
    const sameSecond = email({ id: "e_out5", thread_id: "t5", from_address_email: "us@ciqsends.com", timestamp_email: ago(180) });
    const ghosts = findGhostPending(
      [claim({ id: "i_r5", status: "pending", handledAt: null, instantlyEmailId: "e_in5", receivedAt: ago(180) })],
      [in5, sameSecond],
      NOW,
    );
    expect(ghosts).toEqual([]);
  });

  it("leaves a fresh pending reply alone (grace window — a human may be answering it now)", () => {
    const freshInbound = email({ id: "e_in2", thread_id: "t2", from_address_email: "p2@spa.com", timestamp_email: new Date(NOW - 60_000).toISOString() });
    const ourReply = email({ id: "e_out2", thread_id: "t2", from_address_email: "us@ciqsends.com", timestamp_email: new Date(NOW - 30_000).toISOString() });
    const ghosts = findGhostPending(
      [claim({ id: "i_r2", status: "pending", handledAt: null, instantlyEmailId: "e_in2", receivedAt: new Date(NOW - 60_000).toISOString() })],
      [freshInbound, ourReply],
      NOW,
    );
    expect(ghosts).toEqual([]);
  });
});

// ---- runner harness: the real reconcileSends against faked boundaries ----------
const dbOps = { updates: [] as { table: string; patch: Record<string, unknown> }[] };
const canned = { claimed: [] as Record<string, unknown>[], pending: [] as Record<string, unknown>[], sms: [] as Record<string, unknown>[] };

vi.mock("@/lib/data/supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      // Generic chainable fake: any filter/order call returns the chain; awaiting it resolves
      // the canned rows (selects) or records the patch (updates). Mirrors PostgREST's builder.
      const make = (kind: "select" | "update", patch?: Record<string, unknown>, marks: string[] = []) => {
        const resolve = () => {
          if (kind === "update") {
            dbOps.updates.push({ table, patch: patch! });
            return { data: null, error: null };
          }
          if (table !== "replies") return { data: canned.sms, error: null };
          return marks.includes("in") ? { data: canned.claimed, error: null } : { data: canned.pending, error: null };
        };
        const chain: Record<string, unknown> = {};
        for (const m of ["eq", "in", "gte", "order", "limit", "not"]) {
          chain[m] = (..._a: unknown[]) => make(kind, patch, [...marks, m]);
        }
        chain.then = (res: (v: unknown) => unknown) => res(resolve());
        return chain;
      };
      return {
        select: () => make("select"),
        update: (patch: Record<string, unknown>) => make("update", patch),
      };
    },
  }),
  chunkedUpsert: vi.fn(),
}));
const unibox: InstantlyEmail[] = [];
vi.mock("@/lib/integrations/instantly", () => ({ listAllEmails: async () => unibox }));
vi.mock("@/lib/integrations/twilio", () => ({ smsExistsTo: async () => false }));
vi.mock("@/lib/integrations/telegram", () => ({ sendTelegram: vi.fn(async () => ({ ok: true })), tgEscape: (s: string) => s }));
vi.mock("@/lib/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/config")>();
  return { ...actual, integrations: { ...actual.integrations, supabase: true, instantly: true, twilio: true } };
});

import { reconcileSends } from "@/lib/jobs/reconcile-sends";

const rAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

describe("reconcileSends — end-to-end against faked boundaries", () => {
  beforeEach(() => {
    dbOps.updates = [];
    canned.claimed = [];
    canned.pending = [];
    canned.sms = [];
    unibox.length = 0;
  });

  it("reverts an orphaned claim, corrects a ghost, and reverts a traceless SMS", async () => {
    canned.claimed = [{ id: "i_orphan", status: "auto_sent", instantly_email_id: "e_in", handled_at: rAgo(120), received_at: rAgo(180), inboxes: { email: "us@ciqsends.com" } }];
    canned.pending = [{ id: "i_ghost", status: "pending", instantly_email_id: "e_in2", handled_at: null, received_at: rAgo(180), inboxes: { email: "us@ciqsends.com" } }];
    canned.sms = [{ id: "om_1", to_handle: "+14155550123", sent_at: rAgo(120) }];
    unibox.push(
      email({ id: "e_in", from_address_email: "p1@spa.com", timestamp_email: rAgo(180) }), // orphan's inbound, no outbound after
      email({ id: "e_in2", thread_id: "t2", from_address_email: "p2@spa.com", timestamp_email: rAgo(180) }),
      email({ id: "e_out2", thread_id: "t2", from_address_email: "us@ciqsends.com", timestamp_email: rAgo(90) }), // the ghost's real answer
    );

    const res = await reconcileSends();
    expect(res.orphans).toBe(1);
    expect(res.ghosts).toBe(1);
    expect(res.smsOrphans).toBe(1);
    const patches = dbOps.updates.map((u) => `${u.table}:${u.patch.status}`);
    expect(patches).toContain("replies:pending"); // orphan back to the queue
    expect(patches).toContain("replies:sent"); // ghost corrected
    expect(patches).toContain("outreach_messages:approved"); // sms back for retry
  });

  it("touches NOTHING when every claim verifies", async () => {
    canned.claimed = [{ id: "i_ok", status: "sent", instantly_email_id: "e_in", handled_at: rAgo(120), received_at: rAgo(180), inboxes: { email: "us@ciqsends.com" } }];
    unibox.push(
      email({ id: "e_in", from_address_email: "p1@spa.com", timestamp_email: rAgo(180) }),
      email({ id: "e_out", from_address_email: "us@ciqsends.com", timestamp_email: rAgo(100) }),
    );
    const res = await reconcileSends();
    expect(res.orphans).toBe(0);
    expect(dbOps.updates.filter((u) => u.table === "replies")).toHaveLength(0);
  });
});
