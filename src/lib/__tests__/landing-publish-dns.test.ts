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

// Toggled per-test before importing the action's config reads.
const integrations = { supabase: true, namecheap: false } as Record<string, boolean>;
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, get integrations() { return { ...actual.integrations, ...integrations }; } };
});

import { publishLandingPageAction } from "@/app/(dashboard)/campaigns/landing-actions";
import { addCampaign, ensureData, generateLandingPage, approveLandingPage } from "@/lib/data/store";
import { ensureCname } from "@/lib/integrations/namecheap";

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

describe("publishLandingPageAction — DNS reachability signal", () => {
  beforeEach(() => { vi.mocked(ensureCname).mockClear(); });

  it("flags dnsManual when Namecheap is NOT connected (page attached but unreachable)", async () => {
    integrations.namecheap = false;
    const c = await approvedPage("LP DNS Off");
    const res = await publishLandingPageAction(c.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dnsManual).not.toBeNull();
    expect(res.dnsManual!.target).toBe("cname.vercel-dns.com");
    expect(res.dnsManual!.host).toMatch(/^go\./);
    expect(vi.mocked(ensureCname)).not.toHaveBeenCalled();
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
});
