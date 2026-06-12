import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * approveAndSendAction must be idempotent: the prospect can never receive the same reply
 * twice from a double-click, a second tab, or a retry after a blip. The claim flips the
 * reply out of "pending" BEFORE the external send; a failed send releases the claim.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u_test", name: "Test Operator", email: "t@x.com", role: "owner" as const, avatarColor: "#888" }),
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, integrations: { ...actual.integrations, instantly: true } };
});
const replyToEmail = vi.fn(async (_args: unknown) => ({}));
vi.mock("@/lib/integrations/instantly", () => ({
  replyToEmail: (args: unknown) => replyToEmail(args),
  addToBlocklist: vi.fn(async () => ({})),
}));
vi.mock("@/lib/integrations/zoho", () => ({ setDoNotContact: vi.fn(async () => ({})) }));
vi.mock("@/lib/integrations/telegram", () => ({ sendTelegram: vi.fn(async () => ({ ok: true })), tgEscape: (s: string) => s }));

import { approveAndSendAction, skipReplyAction, snoozeReplyAction } from "@/app/(dashboard)/replies/actions";
import { ensureData, getReplies, getReply } from "@/lib/data/store";

function aPendingReply() {
  const r = getReplies().find((x) => x.status === "pending" && x.instantlyEmailId);
  if (!r) throw new Error("seed has no pending reply with an instantly id");
  return r;
}

describe("approveAndSendAction — claim before send", () => {
  beforeEach(() => replyToEmail.mockClear());

  it("sends once, then refuses a second approval of the same reply", async () => {
    await ensureData();
    const reply = aPendingReply();
    const first = await approveAndSendAction(reply.id, "hello there");
    expect(first.ok).toBe(true);
    expect(replyToEmail).toHaveBeenCalledTimes(1);
    expect(getReply(reply.id)?.status).toBe("sent");

    const second = await approveAndSendAction(reply.id, "hello again");
    expect(second.ok).toBe(false);
    expect(!second.ok && second.error).toMatch(/already handled/i);
    expect(replyToEmail).toHaveBeenCalledTimes(1); // the dangerous part: no second email
  });

  it("skip/snooze on an already-handled reply report failure instead of a false-success toast", async () => {
    await ensureData();
    const handled = getReplies().find((r) => r.status !== "pending");
    expect(handled).toBeTruthy();
    const skip = await skipReplyAction(handled!.id);
    expect(skip.ok).toBe(false);
    expect(!skip.ok && skip.error).toMatch(/already handled/i);
    const snooze = await snoozeReplyAction(handled!.id);
    expect(snooze.ok).toBe(false);
  });

  it("releases the claim back to pending when the send fails", async () => {
    await ensureData();
    const reply = aPendingReply();
    replyToEmail.mockRejectedValueOnce(new Error("instantly 502"));
    const res = await approveAndSendAction(reply.id, "hello");
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/send failed/i);
    // Claimed but nothing went out — must return to the human queue, not show "sent".
    expect(getReply(reply.id)?.status).toBe("pending");
  });
});
