import { describe, it, expect } from "vitest";
import { buildDemoReminder } from "@/lib/reminders";

describe("buildDemoReminder — one-click no-show defense draft", () => {
  it("personalizes with name, company, owner and a confirmable time", () => {
    const { subject, body } = buildDemoReminder({
      firstName: "Dana", company: "Glow Med Spa", scheduledAt: "2026-06-10T17:00:00.000Z",
      demoOwner: "Jon Epstein", senderName: "Trevor",
    });
    expect(subject).toContain("ConversionIQ demo");
    expect(body).toContain("Hi Dana,");
    expect(body).toContain("Glow Med Spa");
    expect(body).toContain("Jon Epstein");
    expect(body.trim().endsWith("Trevor")).toBe(true);
  });

  it("degrades gracefully on missing name/company and bad dates", () => {
    const { body } = buildDemoReminder({
      firstName: "", company: "", scheduledAt: "not-a-date", demoOwner: "Jon", senderName: "Trevor",
    });
    expect(body).toContain("Hi there,");
    expect(body).toContain("your team");
    expect(body).toContain("calendar invite");
  });
});
