import { describe, it, expect } from "vitest";
import { leadTimezone, bucketByTimezone } from "@/lib/send-timing";

describe("send timing — timezone from area code", () => {
  it("maps common area codes to timezones across formats", () => {
    expect(leadTimezone({ phone: "(212) 555-1212" })).toBe("ET");
    expect(leadTimezone({ phone: "312-555-1212" })).toBe("CT");
    expect(leadTimezone({ phone: "+1 415 555 1212" })).toBe("PT");
    expect(leadTimezone({ phone: "303.555.1212" })).toBe("MT");
  });

  it("falls back to unknown for missing / short / unmapped numbers", () => {
    expect(leadTimezone({ phone: null })).toBe("unknown");
    expect(leadTimezone({ phone: "555" })).toBe("unknown");
    expect(leadTimezone({ phone: "999-555-1212" })).toBe("unknown");
  });

  it("buckets in ET→CT→MT→PT→unknown order with counts + a null server window for unknown", () => {
    const buckets = bucketByTimezone([
      { phone: "212-555-0000" },
      { phone: "646-555-0000" },
      { phone: "415-555-0000" },
      { phone: null },
    ]);
    expect(buckets.map((b) => b.tz)).toEqual(["ET", "PT", "unknown"]);
    expect(buckets[0]).toMatchObject({ tz: "ET", count: 2 });
    expect(buckets.find((b) => b.tz === "PT")?.count).toBe(1);
    expect(buckets.find((b) => b.tz === "unknown")?.serverWindow).toBeNull();
  });
});
