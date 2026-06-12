import { describe, it, expect } from "vitest";
import { classifyByRules } from "@/lib/ai/classify";

describe("classifyByRules (no-AI fallback)", () => {
  it("detects unsubscribe", () => {
    expect(classifyByRules("Please unsubscribe me").classification).toBe("unsubscribe");
  });
  it("detects out-of-office", () => {
    expect(classifyByRules("Automatic reply: I am out of office until Monday").classification).toBe("ooo");
  });
  it("treats a clear no as negative (before interested)", () => {
    expect(classifyByRules("Not interested, thanks").classification).toBe("negative");
  });
  it("detects a pricing question", () => {
    expect(classifyByRules("How much does it cost?").classification).toBe("question");
  });
  it("detects interest", () => {
    expect(classifyByRules("This sounds great, let's book a demo").classification).toBe("interested");
  });
  it("detects an objection", () => {
    expect(classifyByRules("We tried a chatbot before and it was robotic").classification).toBe("objection");
  });
  it("classifies adjacent 'no thanks' as negative", () => {
    expect(classifyByRules("no thanks").classification).toBe("negative");
    expect(classifyByRules("No, thank you.").classification).toBe("negative");
  });
  it("does NOT mis-fire negative when 'no' and 'thanks' are far apart in a positive reply", () => {
    // Regression: the old /\bno\b.*\bthanks\b/ spanned the whole body → a real buyer auto-suppressed.
    const r = classifyByRules("There is no rush. Thanks for reaching out, I'd love a demo!");
    expect(r.classification).not.toBe("negative");
    expect(r.classification).toBe("interested");
  });
});
