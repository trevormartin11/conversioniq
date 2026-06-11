import { describe, it, expect } from "vitest";
import { inboxAutoSendGate } from "@/lib/replies/decide";

describe("inboxAutoSendGate — auto-replies never send through a bad inbox", () => {
  it("allows a healthy inbox under its cap", () => {
    expect(inboxAutoSendGate({ status: "healthy", sentToday: 10, dailyCap: 40 })).toEqual({ ok: true, reason: null });
  });

  it("blocks a paused inbox (even with cap headroom)", () => {
    expect(inboxAutoSendGate({ status: "paused", sentToday: 0, dailyCap: 40 })).toEqual({ ok: false, reason: "paused" });
  });

  it("blocks an inbox at or over its daily cap", () => {
    expect(inboxAutoSendGate({ status: "healthy", sentToday: 40, dailyCap: 40 })).toEqual({ ok: false, reason: "cap_reached" });
    expect(inboxAutoSendGate({ status: "healthy", sentToday: 41, dailyCap: 40 })).toEqual({ ok: false, reason: "cap_reached" });
  });

  it("treats a zero cap as no sends allowed (fail closed)", () => {
    expect(inboxAutoSendGate({ status: "healthy", sentToday: 0, dailyCap: 0 })).toEqual({ ok: false, reason: "cap_reached" });
  });

  it("blocks an inbox we don't track (fail closed)", () => {
    expect(inboxAutoSendGate(null)).toEqual({ ok: false, reason: "unknown_inbox" });
    expect(inboxAutoSendGate(undefined)).toEqual({ ok: false, reason: "unknown_inbox" });
  });

  it("counts run-local sends against the cap (the sync's accounting pattern)", () => {
    const fromDb = { status: "healthy", sentToday: 38, dailyCap: 40 };
    // Two auto-sends already made this run: 38 + 2 = 40 — the third must be blocked.
    expect(inboxAutoSendGate({ ...fromDb, sentToday: fromDb.sentToday + 1 }).ok).toBe(true);
    expect(inboxAutoSendGate({ ...fromDb, sentToday: fromDb.sentToday + 2 }).ok).toBe(false);
  });
});
