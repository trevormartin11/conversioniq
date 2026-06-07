import { describe, it, expect } from "vitest";
import { decideReply } from "@/lib/replies/decide";
import type { ReplyClass } from "@/lib/data/types";

// No ANTHROPIC key in tests, so draftReply uses the deterministic rules templates.
const base = { confidence: 0.95, text: "hello", fromName: "Sam", lead: null };

describe("decideReply — auto-send safety gate", () => {
  it("ALWAYS suppresses negative/unsubscribe and never drafts them — even at auto_all", async () => {
    for (const cls of ["negative", "unsubscribe"] as ReplyClass[]) {
      const d = await decideReply({ ...base, classification: cls, level: "auto_all" });
      expect(d.status).toBe("suppressed");
      expect(d.suppress).toBe(true);
      expect(d.aiDraft).toBeNull();
    }
  });

  it("snoozes OOO and does not draft it", async () => {
    const d = await decideReply({ ...base, classification: "ooo", level: "auto_all" });
    expect(d.status).toBe("snoozed");
    expect(d.aiDraft).toBeNull();
  });

  it("approve_all never auto-sends, but still drafts answerable replies", async () => {
    const d = await decideReply({ ...base, classification: "interested", level: "approve_all" });
    expect(d.status).toBe("pending");
    expect(d.aiDraft?.length).toBeTruthy();
  });

  it("auto_all auto-sends a confident, drafted reply", async () => {
    const d = await decideReply({ ...base, classification: "interested", level: "auto_all", confidence: 0.9 });
    expect(d.status).toBe("auto_sent");
  });

  it("does not auto-send when not confident", async () => {
    const d = await decideReply({ ...base, classification: "interested", level: "auto_all", confidence: 0.5 });
    expect(d.status).toBe("pending");
  });

  it("auto_safe auto-sends only the safe classes (referral), not interested", async () => {
    const referral = await decideReply({ ...base, classification: "referral", level: "auto_safe", confidence: 0.9 });
    const interested = await decideReply({ ...base, classification: "interested", level: "auto_safe", confidence: 0.9 });
    expect(referral.status).toBe("auto_sent");
    expect(interested.status).toBe("pending");
  });
});
