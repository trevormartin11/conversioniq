import { describe, it, expect } from "vitest";
import { checkSecretAuth } from "@/lib/api-auth";

describe("checkSecretAuth — fail-closed ops/webhook gate", () => {
  it("allows an unset secret in dev/preview (local testing)", () => {
    expect(checkSecretAuth({ configured: [undefined, undefined], provided: null, isProd: false })).toEqual({ ok: true });
  });

  it("DENIES an unset secret in production (503) — the bug being fixed", () => {
    const r = checkSecretAuth({ configured: [undefined], provided: null, isProd: true });
    expect(r).toEqual({ ok: false, status: 503, error: "auth secret not configured" });
  });

  it("rejects a wrong/absent secret when one is configured (401)", () => {
    expect(checkSecretAuth({ configured: ["s3cret"], provided: null, isProd: true })).toMatchObject({ ok: false, status: 401 });
    expect(checkSecretAuth({ configured: ["s3cret"], provided: "nope", isProd: false })).toMatchObject({ ok: false, status: 401 });
  });

  it("accepts a matching secret (any of the configured)", () => {
    expect(checkSecretAuth({ configured: [undefined, "cron"], provided: "cron", isProd: true })).toEqual({ ok: true });
    expect(checkSecretAuth({ configured: ["sync", "cron"], provided: "sync", isProd: true })).toEqual({ ok: true });
  });
});
