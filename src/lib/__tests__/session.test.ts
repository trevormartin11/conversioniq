import { describe, it, expect } from "vitest";
import { mintSession, verifySession, safeNextPath } from "@/lib/session";

describe("signed session tokens — the cookie never carries AUTH_SECRET", () => {
  it("mints a token that verifies and does not contain the secret", async () => {
    const token = await mintSession("super-secret-value");
    expect(token).not.toContain("super-secret-value");
    expect(await verifySession("super-secret-value", token)).toBe(true);
  });

  it("rejects a tampered signature, a wrong secret, and the legacy raw-secret cookie", async () => {
    const token = await mintSession("s1");
    expect(await verifySession("s1", token.slice(0, -2) + "ff")).toBe(false);
    expect(await verifySession("other-secret", token)).toBe(false);
    expect(await verifySession("s1", "s1")).toBe(false); // old cookies (raw secret) are invalid
    expect(await verifySession("s1", undefined)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await mintSession("s1", -1000);
    expect(await verifySession("s1", token)).toBe(false);
  });

  it("rejects an expiry that was tampered forward", async () => {
    const token = await mintSession("s1", -1000); // expired…
    const [, sig] = [token.slice(0, token.indexOf(".")), token.slice(token.indexOf(".") + 1)];
    const forged = `${Date.now() + 86_400_000}.${sig}`; // …with a future exp glued on
    expect(await verifySession("s1", forged)).toBe(false);
  });
});

describe("safeNextPath — login redirect stays on-origin", () => {
  it("allows same-origin paths", () => {
    expect(safeNextPath("/replies")).toBe("/replies");
    expect(safeNextPath("/campaigns/c_1")).toBe("/campaigns/c_1");
  });
  it("rejects absolute and protocol-relative URLs (open-redirect phishing)", () => {
    expect(safeNextPath("https://evil.example/phish")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
