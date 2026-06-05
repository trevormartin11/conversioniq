import { describe, it, expect } from "vitest";
import { rewriteCopy } from "@/lib/ai/copy";

describe("rewriteCopy — AI in-place edit", () => {
  it("returns copy unchanged + 'rules' when no Claude key is configured", async () => {
    const r = await rewriteCopy({ subject: "quick question", body: "Hi {{firstName}}", instruction: "make it shorter" });
    expect(r.subject).toBe("quick question");
    expect(r.body).toBe("Hi {{firstName}}");
    expect(r.source).toBe("rules");
  });
});
