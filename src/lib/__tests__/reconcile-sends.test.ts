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
    from: (table: string) => ({
      select: () => {
        const q = {
          in: () => ({ gte: async () => ({ data: canned.claimed, error: null }) }),
          eq: (_c: string, v: unknown) =>
            table === "replies"
              ? { gte: async () => ({ data: canned.pending, error: null }) }
              : { eq: () => ({ gte: () => ({ limit: async () => ({ data: canned.sms, error: null }) }) }) },
        };
        return q;
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, _v: unknown) => ({
          in: async () => { dbOps.updates.push({ table, patch }); return { error: null }; },
          eq: async () => { dbOps.updates.push({ table, patch }); return { error: null }; },
        }),
      }),
    }),
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
