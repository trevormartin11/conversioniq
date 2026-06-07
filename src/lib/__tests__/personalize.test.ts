import { describe, it, expect } from "vitest";
import { normalizeUrl } from "@/lib/ai/personalize";

describe("personalize — normalizeUrl", () => {
  it("adds a protocol to bare domains and trims the root path", () => {
    expect(normalizeUrl("acme.com")).toBe("https://acme.com");
    expect(normalizeUrl("  acme.com  ")).toBe("https://acme.com");
    expect(normalizeUrl("https://acme.com/about")).toBe("https://acme.com/about");
  });

  it("rejects empty or non-host input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("notaurl")).toBeNull();
  });
});
