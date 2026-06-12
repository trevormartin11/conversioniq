import { describe, it, expect } from "vitest";
import { inboxAutoSendGate } from "@/lib/replies/decide";

describe("inboxAutoSendGate — auto-replies never send through a bad inbox", () => {
  it("allows an active inbox under its cap", () => {
    expect(inboxAutoSendGate({ status: "active", sentToday: 10, dailyCap: 40 })).toEqual({ ok: true, reason: null });
  });

  it("allows a warming inbox (1:1 replies are fine while warming)", () => {
    expect(inboxAutoSendGate({ status: "warming", sentToday: 0, dailyCap: 40 })).toEqual({ ok: true, reason: null });
  });

  it("blocks a paused inbox (even with cap headroom)", () => {
    expect(inboxAutoSendGate({ status: "paused", sentToday: 0, dailyCap: 40 })).toEqual({ ok: false, reason: "inactive" });
  });

  it("blocks an errored / unknown-status inbox (allowlist, fail closed)", () => {
    expect(inboxAutoSendGate({ status: "error", sentToday: 0, dailyCap: 40 })).toEqual({ ok: false, reason: "inactive" });
    expect(inboxAutoSendGate({ status: "", sentToday: 0, dailyCap: 40 })).toEqual({ ok: false, reason: "inactive" });
  });

  it("blocks an inbox at or over its daily cap", () => {
    expect(inboxAutoSendGate({ status: "active", sentToday: 40, dailyCap: 40 })).toEqual({ ok: false, reason: "cap_reached" });
    expect(inboxAutoSendGate({ status: "active", sentToday: 41, dailyCap: 40 })).toEqual({ ok: false, reason: "cap_reached" });
  });

  it("treats a zero cap as no sends allowed, and clamps a negative counter (no over-grant)", () => {
    expect(inboxAutoSendGate({ status: "active", sentToday: 0, dailyCap: 0 })).toEqual({ ok: false, reason: "cap_reached" });
    expect(inboxAutoSendGate({ status: "active", sentToday: -3, dailyCap: 0 })).toEqual({ ok: false, reason: "cap_reached" });
  });

  it("blocks an inbox we don't track (fail closed)", () => {
    expect(inboxAutoSendGate(null)).toEqual({ ok: false, reason: "unknown_inbox" });
    expect(inboxAutoSendGate(undefined)).toEqual({ ok: false, reason: "unknown_inbox" });
  });

  it("counts run-local sends against the cap (the sync's accounting pattern)", () => {
    const fromDb = { status: "active", sentToday: 38, dailyCap: 40 };
    expect(inboxAutoSendGate({ ...fromDb, sentToday: fromDb.sentToday + 1 }).ok).toBe(true);
    expect(inboxAutoSendGate({ ...fromDb, sentToday: fromDb.sentToday + 2 }).ok).toBe(false);
  });
});
