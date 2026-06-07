import { describe, it, expect } from "vitest";
import { addOutreach, getChannelAccount, getOutreachMessage, recordConsent, sendOutreach } from "@/lib/data/store";

// Exercises the single send chokepoint against the seeded dataset (mock mode).
describe("outreach send chokepoint", () => {
  it("sends an SMS that has consent and increments the sending account", async () => {
    const before = getChannelAccount("ca_sms")!.sentToday;
    const r = await sendOutreach("om_1", "Tester");
    expect(r.ok).toBe(true);
    expect(getOutreachMessage("om_1")!.status).toBe("sent");
    expect(getChannelAccount("ca_sms")!.sentToday).toBe(before + 1);
  });

  it("blocks an SMS with no opt-in, then auto-unblocks once consent is captured", async () => {
    expect(getOutreachMessage("om_2")!.status).toBe("needs_consent");

    const blocked = await sendOutreach("om_2", "Tester");
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/consent|TCPA/i);

    await recordConsent({ channel: "sms", handle: "+1 (415) 555-0199", source: "manual", status: "opted_in" }, "Tester");
    // Capturing consent reconciles the parked draft (formatting-insensitive match).
    expect(getOutreachMessage("om_2")!.status).toBe("draft");

    const ok = await sendOutreach("om_2", "Tester");
    expect(ok.ok).toBe(true);
    expect(getOutreachMessage("om_2")!.status).toBe("sent");
  });

  it("blocks an SMS to an opted-out (STOP) contact", async () => {
    const m = await addOutreach({ channel: "sms", toName: "Stop Person", toHandle: "+14155550163", body: "hi" }, "Tester");
    expect(m.status).toBe("needs_consent"); // opted_out is not opted_in → parked
    const r = await sendOutreach(m.id, "Tester");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/opted out/i);
  });

  it("queues a social DM without consent and sends on the human click", async () => {
    const m = await addOutreach({ channel: "linkedin", toName: "Soc Prospect", toHandle: "@Soc-Prospect", body: "hey" }, "Tester");
    expect(m.status).toBe("draft");
    expect(m.toHandle).toBe("soc-prospect"); // normalized
    const r = await sendOutreach(m.id, "Tester");
    expect(r.ok).toBe(true);
    expect(getOutreachMessage(m.id)!.status).toBe("sent");
  });
});
