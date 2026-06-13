import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * activateCampaign / pauseCampaign must send a JSON body: headers() sets
 * content-type: application/json and Instantly rejects a body-less POST carrying
 * that header with 400 "Body cannot be empty…" — found live when the hub's Launch
 * button silently failed against the real API (Pause, incl. the deliverability
 * auto-pause kill switch, had the same bug).
 */

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, integrations: { ...actual.integrations, instantly: true } };
});
vi.mock("../http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../http")>();
  return { ...actual, httpJson: vi.fn(async () => ({})) };
});

import { activateCampaign, pauseCampaign } from "../instantly";
import { httpJson } from "../http";

describe("Instantly activate/pause — JSON content-type requires a body", () => {
  beforeEach(() => { process.env.INSTANTLY_API_KEY = "test_key"; });
  afterEach(() => { delete process.env.INSTANTLY_API_KEY; vi.mocked(httpJson).mockClear(); });

  it.each([
    ["activateCampaign", activateCampaign, "activate"],
    ["pauseCampaign", pauseCampaign, "pause"],
  ] as const)("%s sends a non-empty JSON body", async (_name, fn, path) => {
    await fn("camp_1");
    const [, url, init] = vi.mocked(httpJson).mock.calls.at(-1)!;
    expect(url).toContain(`/campaigns/camp_1/${path}`);
    const i = init as RequestInit;
    expect((i.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(i.body).toBeTruthy();
    expect(() => JSON.parse(String(i.body))).not.toThrow();
  });
});
