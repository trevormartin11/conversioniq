import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * addProjectDomain idempotency — caught live during the launch-week publish test: Vercel's
 * literal error code is `domain_already_in_use` (underscores), which the prose-style
 * /already.*in use/ pattern never matched, so every RE-publish of a live page failed loudly.
 * Already attached to THIS project must read as success; attached to a DIFFERENT project is
 * a real conflict the operator has to resolve.
 */

vi.mock("../http", () => ({ httpJson: vi.fn() }));

import { addProjectDomain } from "../vercel";
import { httpJson } from "../http";

const OWN_PROJECT = "prj_own123";

describe("addProjectDomain — already-attached handling", () => {
  beforeEach(() => {
    process.env.VERCEL_TOKEN = "tok_test";
    process.env.VERCEL_PROJECT_ID = OWN_PROJECT;
  });
  afterEach(() => {
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
    vi.mocked(httpJson).mockReset();
  });

  it("treats a clean attach as success", async () => {
    vi.mocked(httpJson).mockResolvedValueOnce({});
    expect(await addProjectDomain("go.example.com")).toEqual({ ok: true });
  });

  it("treats domain_already_in_use by THIS project as success (re-publish idempotency)", async () => {
    vi.mocked(httpJson).mockRejectedValueOnce(new Error(
      `[vercel] {"error":{"code":"domain_already_in_use","projectId":"${OWN_PROJECT}","domain":{"name":"go.example.com","apexName":"example.com","projectId":"${OWN_PROJECT}"}}}`,
    ));
    expect(await addProjectDomain("go.example.com")).toEqual({ ok: true });
  });

  it("keeps domain_already_in_use by a DIFFERENT project as a named failure", async () => {
    vi.mocked(httpJson).mockRejectedValueOnce(new Error(
      '[vercel] {"error":{"code":"domain_already_in_use","projectId":"prj_other999","domain":{"name":"go.example.com","projectId":"prj_other999"}}}',
    ));
    const res = await addProjectDomain("go.example.com");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/different Vercel project/i);
  });

  it("still accepts the prose-style already-exists messages", async () => {
    vi.mocked(httpJson).mockRejectedValueOnce(new Error("[vercel] domain already exists on project"));
    expect(await addProjectDomain("go.example.com")).toEqual({ ok: true });
  });

  it("propagates unrelated failures verbatim", async () => {
    vi.mocked(httpJson).mockRejectedValueOnce(new Error("[vercel] forbidden: bad token"));
    const res = await addProjectDomain("go.example.com");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/bad token/);
  });
});
