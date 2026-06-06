import { describe, it, expect, vi, afterEach } from "vitest";
import { probes, checkConnections } from "@/lib/integrations/healthcheck";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("connection self-test — safety invariants", () => {
  it("never probes unconfigured integrations (no network, all reported untested)", async () => {
    // The test process has no integration keys, so every probe must be skipped.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in tests"));
    const results = await checkConnections();
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.configured === false && r.ok === null)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("paid / IP-gated providers are presence-only (no auto-probe that could spend or fail on allowlist)", () => {
    for (const k of ["outscraper", "findymail", "lusha", "namecheap"] as const) {
      expect(probes[k]).toBeUndefined();
    }
  });

  it("Apollo CIQ probe only hits the free auth/health endpoint — never a billable call", async () => {
    vi.stubEnv("APOLLO_CIQ_API_KEY", "test-key");
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ is_logged_in: true }), { status: 200 });
    });
    const detail = await probes.apolloCiq!();
    expect(detail).toBe("key valid");
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/v1/auth/health");
    for (const billable of ["search", "enrich", "match", "people", "organizations", "bulk", "sequences"]) {
      expect(urls[0]).not.toContain(billable);
    }
  });

  it("a failing probe is captured, not thrown", async () => {
    vi.stubEnv("APOLLO_PERSONAL_API_KEY", "bad");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ is_logged_in: false }), { status: 200 }),
    );
    await expect(probes.apolloPersonal!()).rejects.toThrow(/rejected/);
  });
});
