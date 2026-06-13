import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, integrations: { ...actual.integrations, cloudflare: true } };
});
vi.mock("../http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../http")>();
  return { ...actual, httpJson: vi.fn() };
});

import { fqdn, hostClaimed, ensureCname, type CfRecord } from "../cloudflare";
import { httpJson } from "../http";

describe("fqdn — host name within a zone", () => {
  it("prefixes a relative name, passes through an apex or an already-qualified host", () => {
    expect(fqdn("goreplyscale.com", "go")).toBe("go.goreplyscale.com");
    expect(fqdn("goreplyscale.com", "@")).toBe("goreplyscale.com");
    expect(fqdn("goreplyscale.com", "goreplyscale.com")).toBe("goreplyscale.com");
    expect(fqdn("goreplyscale.com", "go.goreplyscale.com")).toBe("go.goreplyscale.com");
  });
});

describe("hostClaimed — read-before-write guard", () => {
  const recs: CfRecord[] = [
    { type: "A", name: "go.x.com", content: "1.2.3.4" },
    { type: "TXT", name: "_dmarc.x.com", content: "v=DMARC1; p=none" },
  ];
  it("detects an existing address-bearing record on the host (case-insensitive)", () => {
    expect(hostClaimed(recs, "GO.x.com", ["CNAME", "A", "AAAA"])).toBe(true);
    expect(hostClaimed(recs, "_dmarc.x.com", ["TXT"])).toBe(true);
  });
  it("returns false for an unclaimed host", () => {
    expect(hostClaimed(recs, "book.x.com", ["CNAME", "A", "AAAA"])).toBe(false);
  });
});

describe("ensureCname — token-auth create, never duplicates", () => {
  const ZONE = { success: true, result: [{ id: "zone1", name: "goreplyscale.com" }] };
  beforeEach(() => vi.mocked(httpJson).mockReset());

  it("creates the CNAME (proxied:false) when the host is unclaimed", async () => {
    // Calls in order: zone lookup → list records (empty) → create.
    vi.mocked(httpJson)
      .mockResolvedValueOnce(ZONE as never)
      .mockResolvedValueOnce({ success: true, result: [] } as never)
      .mockResolvedValueOnce({ success: true, result: { id: "rec_new" } } as never);
    const res = await ensureCname("goreplyscale.com", "go", "cname.vercel-dns.com");
    expect(res).toEqual({ added: true, live: true });
    expect(vi.mocked(httpJson)).toHaveBeenCalledTimes(3);
    const post = vi.mocked(httpJson).mock.calls[2];
    expect((post[2] as { method?: string }).method).toBe("POST");
    const body = JSON.parse(String((post[2] as { body?: string }).body));
    expect(body).toMatchObject({ type: "CNAME", name: "go.goreplyscale.com", content: "cname.vercel-dns.com", proxied: false });
  });

  it("does NOT create when the host already exists (idempotent)", async () => {
    vi.mocked(httpJson)
      .mockResolvedValueOnce(ZONE as never)
      .mockResolvedValueOnce({ success: true, result: [{ type: "CNAME", name: "go.goreplyscale.com", content: "cname.vercel-dns.com" }] } as never);
    const res = await ensureCname("goreplyscale.com", "go", "cname.vercel-dns.com");
    expect(res).toEqual({ added: false, live: true });
    expect(vi.mocked(httpJson)).toHaveBeenCalledTimes(2); // no create call
  });

  it("throws a clear error when the zone isn't on the account", async () => {
    vi.mocked(httpJson).mockResolvedValue({ success: true, result: [] } as never);
    await expect(ensureCname("notmine.com", "go", "cname.vercel-dns.com")).rejects.toThrow(/zone not found/i);
  });

  it("surfaces a Cloudflare success:false envelope as a thrown error", async () => {
    vi.mocked(httpJson).mockResolvedValue({ success: false, errors: [{ message: "Invalid request headers" }], result: null } as never);
    await expect(ensureCname("goreplyscale.com", "go", "cname.vercel-dns.com")).rejects.toThrow(/Invalid request headers/);
  });
});
