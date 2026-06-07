import { describe, it, expect } from "vitest";
import { addChannelAccount, addOutreach, channelCapacity, getChannelAccount, getOutreachMessage, removeChannelAccount, sendOutreach, updateChannelAccount } from "@/lib/data/store";

// CRUD for the sending identities that power the SMS + social DM channels (mock mode).
describe("channel account setup", () => {
  it("adds an SMS account with sane defaults and grows channel capacity", async () => {
    const capBefore = channelCapacity("sms").cap;
    const a = await addChannelAccount({ channel: "sms", label: "Test line", identifier: "+14155551234", dailyCap: 120 }, "Tester");
    expect(a.id).toMatch(/^ca_/);
    expect(a.sentToday).toBe(0);
    expect(a.status).toBe("active");
    expect(a.tenDlc).toBe("pending"); // SMS starts unregistered-pending until 10DLC is approved
    expect(a.provider).toBe("twilio");
    expect(getChannelAccount(a.id)).not.toBeNull();
    expect(channelCapacity("sms").cap).toBe(capBefore + 120);
  });

  it("forces tenDlc to n/a for social accounts", async () => {
    const a = await addChannelAccount({ channel: "linkedin", label: "Founder LI", identifier: "founder", dailyCap: 25, tenDlc: "registered" }, "Tester");
    expect(a.tenDlc).toBe("n/a");
    expect(a.provider).toBe("linkedin");
  });

  it("updates cap and status (pausing flips it to a non-sending state)", async () => {
    const a = await addChannelAccount({ channel: "instagram", label: "IG", identifier: "brand", dailyCap: 30 }, "Tester");
    await updateChannelAccount(a.id, { dailyCap: 10, status: "pending" }, "Tester");
    const updated = getChannelAccount(a.id)!;
    expect(updated.dailyCap).toBe(10);
    expect(updated.status).toBe("pending");
  });

  it("removes an account and reports a miss for unknown ids", async () => {
    const a = await addChannelAccount({ channel: "linkedin", label: "Temp", identifier: "temp", dailyCap: 20 }, "Tester");
    expect(getChannelAccount(a.id)).not.toBeNull();
    expect(await removeChannelAccount(a.id, "Tester")).toBe(true);
    expect(getChannelAccount(a.id)).toBeNull();
    expect(await removeChannelAccount("ca_does_not_exist", "Tester")).toBe(false);
  });

  it("re-resolves to the channel default when a message's pinned account is removed", async () => {
    await addChannelAccount({ channel: "linkedin", label: "Keeper", identifier: "keeper", dailyCap: 25 }, "Tester");
    const pinned = await addChannelAccount({ channel: "linkedin", label: "Pinned", identifier: "pinned", dailyCap: 25 }, "Tester");
    const msg = await addOutreach({ channel: "linkedin", accountId: pinned.id, toName: "Prospect", toHandle: "@prospect-x", body: "hi" }, "Tester");
    expect(msg.accountId).toBe(pinned.id);
    await removeChannelAccount(pinned.id, "Tester");
    const r = await sendOutreach(msg.id, "Tester"); // would fail with "inactive account" without the fallback
    expect(r.ok).toBe(true);
    expect(getOutreachMessage(msg.id)!.status).toBe("sent");
  });
});
