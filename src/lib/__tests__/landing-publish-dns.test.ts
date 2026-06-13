import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Caught by the LIVE landing-publish check: Namecheap (DNS) was OFF, so publishing attached
 * the Vercel domain but never created the CNAME — yet the page was marked "published" and the
 * UI showed a bare "Live at…". The page was actually UNREACHABLE. publishLandingPageAction now
 * returns a `dnsManual` signal when the CNAME couldn't be auto-created, so the UI can warn with
 * the exact record to add instead of lying about reachability.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u_test", name: "Test Operator", email: "t@ciq.local", role: "owner" as const, avatarColor: "#888" }),
}));
vi.mock("@/lib/integrations/vercel", () => ({
  vercelConfigured: () => true,
  addProjectDomain: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/integrations/namecheap", () => ({ ensureCname: vi.fn(async () => ({ added: true })) }));
vi.mock("@/lib/integrations/cloudflare", () => ({ ensureCname: vi.fn(async () => ({ added: true })) }));

// Toggled per-test before importing the action's config reads.
const integrations = { supabase: true, namecheap: false, cloudflare: false } as Record<string, boolean>;
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, get integrations() { return { ...actual.integrations, ...integrations }; } };
});

import { publishLandingPageAction } from "@/app/(dashboard)/campaigns/landing-actions";
import { addCampaign, ensureData, generateLandingPage, approveLandingPage } from "@/lib/data/store";
import { ensureCname } from "@/lib/integrations/namecheap";
import { ensureCname as cfEnsureCname } from "@/lib/integrations/cloudflare";

async function approvedPage(name: string) {
  await ensureData();
  const c = await addCampaign({ name, vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test Operator");
  // Assign an inbox so the publish can resolve a sending domain (campaignSendingDomain).
  const { getInboxes, getDataset } = await import("@/lib/data/store");
  const inbox = getInboxes()[0];
  getDataset().campaigns.find((x) => x.id === c.id)!.inboxIds = [inbox.id];
  await generateLandingPage(c.id, "Test Operator");
  await approveLandingPage(c.id, "Test Operator");
  return c;
}

describe("publishLandingPageAction — DNS reachability signal + per-domain provider fallback", () => {
  beforeEach(() => {
    vi.mocked(ensureCname).mockClear().mockResolvedValue({ added: true, live: true });
    vi.mocked(cfEnsureCname).mockClear().mockResolvedValue({ added: true, live: true });
    integrations.namecheap = false;
    integrations.cloudflare = false;
  });

  it("flags dnsManual when NO provider is connected (page attached but unreachable)", async () => {
    const c = await approvedPage("LP DNS Off");
    const res = await publishLandingPageAction(c.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dnsManual).not.toBeNull();
    expect(res.dnsManual!.target).toBe("cname.vercel-dns.com");
    expect(res.dnsManual!.host).toMatch(/^go\./);
    expect(vi.mocked(ensureCname)).not.toHaveBeenCalled();
    expect(vi.mocked(cfEnsureCname)).not.toHaveBeenCalled();
  });

  it("does NOT flag dnsManual when Namecheap created the CNAME", async () => {
    integrations.namecheap = true;
    const c = await approvedPage("LP DNS On");
    const res = await publishLandingPageAction(c.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dnsManual).toBeNull();
    expect(vi.mocked(ensureCname)).toHaveBeenCalledTimes(1);
  });

  it("uses Cloudflare (preferred) when it manages the zone — Namecheap untouched", async () => {
    integrations.cloudflare = true;
    integrations.namecheap = true;
    const c = await approvedPage("LP CF On");
    const res = await publishLandingPageAction(c.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dnsManual).toBeNull();
    expect(vi.mocked(cfEnsureCname)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ensureCname)).not.toHaveBeenCalled(); // Namecheap never hit
  });

  it("FALLS BACK to Namecheap when the domain isn't on Cloudflare (zone not found)", async () => {
    integrations.cloudflare = true;
    integrations.namecheap = true;
    vi.mocked(cfEnsureCname).mockRejectedValueOnce(new Error("cloudflare: zone not found for go.x.com"));
    const c = await approvedPage("LP CF Fallback NC");
    const res = await publishLandingPageAction(c.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dnsManual).toBeNull();
    expect(vi.mocked(cfEnsureCname)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ensureCname)).toHaveBeenCalledTimes(1); // fell through to Namecheap
  });

  it("falls back to the MANUAL warning when the domain is on neither provider", async () => {
    integrations.cloudflare = true;
    integrations.namecheap = false;
    vi.mocked(cfEnsureCname).mockRejectedValueOnce(new Error("cloudflare: zone not found for go.x.com"));
    const c = await approvedPage("LP CF Fallback Manual");
    const res = await publishLandingPageAction(c.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dnsManual).not.toBeNull();
  });

  it("a REAL Cloudflare error (not zone-not-found) fails the publish, never silently falls through", async () => {
    integrations.cloudflare = true;
    integrations.namecheap = true;
    vi.mocked(cfEnsureCname).mockRejectedValueOnce(new Error("cloudflare: Invalid request headers"));
    const c = await approvedPage("LP CF Real Error");
    const res = await publishLandingPageAction(c.id);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/Invalid request headers/);
    expect(vi.mocked(ensureCname)).not.toHaveBeenCalled(); // did NOT fall through on a real error
  });
});
