import { describe, it, expect, vi } from "vitest";

/**
 * The social-DM follow-up queue must be zero-manual-lookup: engaged email repliers in,
 * ready-to-click DM cards out (profile deep link + drafted copy attached), idempotent
 * across runs. Apollo is faked; the drafter runs for real (rules fallback in tests).
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u_test", name: "Test Operator", email: "t@x.com", role: "owner" as const, avatarColor: "#888" }),
}));
vi.mock("@/lib/integrations/apollo", () => ({
  apolloSocialProfile: async (email: string) =>
    email.startsWith("noprof") ? null : { linkedinUrl: `https://www.linkedin.com/in/${email.split("@")[0]}`, title: "Owner" },
  apolloHiringSignal: async () => "Currently hiring: Front Desk Coordinator",
}));

import { queueSocialFollowupsAction } from "@/app/(dashboard)/channels/actions";
import { addSuppression, ensureData, getDataset, getLeads, getOutreach, getReplies } from "@/lib/data/store";

describe("queueSocialFollowupsAction — engaged repliers → ready-to-send DM cards", () => {
  it("queues DMs with the profile deep link and drafted copy, then dedupes on re-run", async () => {
    await ensureData();
    // Make the opt-out filter LOAD-BEARING (mutation check M5): give one engaged replier a
    // dnc suppression — if the filter is ever disabled, the final assertion below fails.
    const engagedReply = getReplies().find((r) => r.classification === "interested" && r.leadId);
    const dncLead = getLeads().find((l) => l.id === engagedReply?.leadId);
    expect(dncLead).toBeTruthy();
    await addSuppression(
      { email: dncLead!.email, domain: null, reason: "dnc", source: "test", leadId: dncLead!.id, note: null },
      "test",
    );
    // Keep the lead engaged-and-active so ONLY the opt-out filter can exclude it.
    const leadRow = getDataset().leads.find((l) => l.id === dncLead!.id)!;
    leadRow.status = "replied";
    // Engaged audience from the seed: leads whose latest reply is interested/question/not_now
    // and who aren't booked/closed/lost.
    const engagedLeadIds = new Set(
      getReplies()
        .filter((r) => ["interested", "question", "not_now"].includes(r.classification) && r.leadId)
        .map((r) => r.leadId as string),
    );
    expect(engagedLeadIds.size).toBeGreaterThan(0); // seed sanity

    const first = await queueSocialFollowupsAction({ channel: "linkedin" });
    expect(first.ok).toBe(true);
    expect(first.queued).toBeGreaterThan(0);

    const queued = getOutreach().filter((m) => m.channel === "linkedin" && m.source !== "manual");
    for (const m of queued.slice(0, first.queued)) {
      expect(m.profileUrl).toMatch(/^https:\/\/www\.linkedin\.com\/in\//); // the deep link — no manual hunting
      expect(m.body.length).toBeGreaterThan(20); // copy formed without intervention
      expect(m.status).toBe("draft"); // human still does the platform-required click
      expect(m.leadId && engagedLeadIds.has(m.leadId)).toBe(true);
      const lead = getLeads().find((l) => l.id === m.leadId);
      expect(["new", "contacted", "replied", "positive"]).toContain(lead?.status); // never booked/closed/lost
    }

    // Idempotent: the same audience doesn't get queued twice.
    let total = first.queued;
    let guard = 0;
    let more = first.more;
    while (more && guard++ < 20) {
      const next = await queueSocialFollowupsAction({ channel: "linkedin" });
      total += next.queued;
      more = next.more;
    }
    const rerun = await queueSocialFollowupsAction({ channel: "linkedin" });
    expect(rerun.queued).toBe(0);
    expect(total).toBeLessThanOrEqual(engagedLeadIds.size);

    // "contacted" suppression (we emailed them) must NOT block a DM — but real opt-outs must:
    // no queued DM may target a dnc/unsubscribed address.
    const { getSuppression } = await import("@/lib/data/store");
    const optedOutEmails = new Set(getSuppression().filter((s) => ["dnc", "unsubscribed", "manual"].includes(s.reason)).map((s) => (s.email ?? "").toLowerCase()));
    for (const m of getOutreach().filter((x) => x.channel === "linkedin" && x.leadId)) {
      const lead = getLeads().find((l) => l.id === m.leadId);
      if (lead) expect(optedOutEmails.has(lead.email.toLowerCase())).toBe(false);
    }
  });
});
