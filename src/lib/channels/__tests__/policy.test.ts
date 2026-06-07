import { describe, it, expect } from "vitest";
import { capRemaining, classifyInboundKeyword, findConsent, normalizeHandle, sendGate, smsConsentGate } from "@/lib/channels/policy";
import type { ChannelAccount, ConsentRecord } from "@/lib/data/types";

const consent = (over: Partial<ConsentRecord>): ConsentRecord => ({
  id: "x", leadId: null, channel: "sms", handle: "+14155550100", status: "opted_in",
  source: "manual", proof: null, capturedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", note: null, ...over,
});
const acct = (over: Partial<ChannelAccount>): ChannelAccount => ({
  id: "a", channel: "sms", label: "x", identifier: "+1", status: "active", dailyCap: 100,
  sentToday: 0, tenDlc: "registered", provider: "twilio", note: null, ...over,
});

describe("normalizeHandle", () => {
  it("canonicalizes phone numbers to E.164 (one real number, regardless of format)", () => {
    expect(normalizeHandle("sms", "+1 (415) 555-0100")).toBe("+14155550100");
    expect(normalizeHandle("sms", "415.555.0100")).toBe("+14155550100"); // bare US 10-digit → +1
    expect(normalizeHandle("sms", "4155550100")).toBe("+14155550100");
    expect(normalizeHandle("sms", "1 (415) 555-0100")).toBe("+14155550100");
  });
  it("returns '' for junk so the gate fails closed", () => {
    expect(normalizeHandle("sms", "+")).toBe("");
    expect(normalizeHandle("sms", "+abc")).toBe("");
    expect(normalizeHandle("sms", "12")).toBe("");
  });
  it("lowercases and strips @ for social handles", () => {
    expect(normalizeHandle("linkedin", "@Trevor-Martin")).toBe("trevor-martin");
  });
});

describe("findConsent", () => {
  it("matches the same number across formats and prefers the most-recent record", () => {
    const old = consent({ status: "opted_in", updatedAt: "2026-01-01T00:00:00Z" });
    const recent = consent({ status: "opted_out", updatedAt: "2026-02-01T00:00:00Z" });
    expect(findConsent([old, recent], "sms", "+1 (415) 555-0100")?.status).toBe("opted_out");
    // A bare 10-digit national form now matches the stored E.164 record (no confusing miss).
    expect(findConsent([consent({ status: "opted_in" })], "sms", "415 555 0100")?.status).toBe("opted_in");
  });
  it("fails safe: a junk handle never matches a real consent record", () => {
    expect(findConsent([consent({ status: "opted_in" })], "sms", "+")).toBeUndefined();
    expect(findConsent([consent({ status: "opted_in" })], "sms", "nonsense")).toBeUndefined();
  });
});

describe("smsConsentGate (TCPA — the legal gate)", () => {
  it("blocks when no record exists", () => {
    expect(smsConsentGate([], "+14155550100")).toEqual({ ok: false, reason: "no_consent" });
  });
  it("blocks a pending record", () => {
    expect(smsConsentGate([consent({ status: "pending" })], "+14155550100")).toEqual({ ok: false, reason: "no_consent" });
  });
  it("blocks an opted_out (STOP) record", () => {
    expect(smsConsentGate([consent({ status: "opted_out" })], "+14155550100")).toEqual({ ok: false, reason: "opted_out" });
  });
  it("allows an opted_in record regardless of phone formatting", () => {
    expect(smsConsentGate([consent({ status: "opted_in" })], "+1 (415) 555-0100")).toEqual({ ok: true });
  });
});

describe("capRemaining + sendGate (durability)", () => {
  it("capRemaining floors at 0", () => {
    expect(capRemaining(acct({ dailyCap: 25, sentToday: 30 }))).toBe(0);
    expect(capRemaining(acct({ dailyCap: 25, sentToday: 6 }))).toBe(19);
    expect(capRemaining(null)).toBe(0);
  });
  it("runs the SMS consent gate before the cap/account checks", () => {
    expect(sendGate("sms", [], "+14155550100", acct({}))).toEqual({ ok: false, reason: "no_consent" });
  });
  it("blocks when the sending account is inactive", () => {
    expect(sendGate("linkedin", [], "x", acct({ channel: "linkedin", status: "pending" }))).toEqual({ ok: false, reason: "inactive_account" });
    expect(sendGate("linkedin", [], "x", null)).toEqual({ ok: false, reason: "inactive_account" });
  });
  it("blocks when the daily cap is exhausted", () => {
    expect(sendGate("linkedin", [], "x", acct({ channel: "linkedin", sentToday: 100, dailyCap: 100 }))).toEqual({ ok: false, reason: "cap_reached" });
  });
  it("allows a social send within cap on an active account (no consent needed)", () => {
    expect(sendGate("linkedin", [], "x", acct({ channel: "linkedin" }))).toEqual({ ok: true });
  });
  it("allows an SMS with consent within cap", () => {
    expect(sendGate("sms", [consent({})], "+14155550100", acct({}))).toEqual({ ok: true });
  });
});

describe("classifyInboundKeyword (inbound STOP/START)", () => {
  it("treats carrier opt-out keywords as opt_out (case/punctuation-insensitive, first word)", () => {
    for (const b of ["STOP", "stop", "Stop.", "STOP please", "stopall", "Unsubscribe", "CANCEL", "quit", "end", "OPTOUT"]) {
      expect(classifyInboundKeyword(b)).toBe("opt_out");
    }
  });
  it("treats re-subscribe keywords as opt_in", () => {
    for (const b of ["START", "start", "Yes!", "unstop"]) {
      expect(classifyInboundKeyword(b)).toBe("opt_in");
    }
  });
  it("returns null for a normal reply or empty body", () => {
    expect(classifyInboundKeyword("Sounds good, let's chat")).toBeNull();
    expect(classifyInboundKeyword("")).toBeNull();
    expect(classifyInboundKeyword("   ")).toBeNull();
  });
});
