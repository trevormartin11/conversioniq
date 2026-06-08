import { describe, it, expect } from "vitest";
import { ensureData, getIcp, setIcp } from "@/lib/data/store";

describe("ICP override — editable source-of-truth", () => {
  it("persists a set value and reads it back", async () => {
    await ensureData();
    const text = "We win with high-ticket, owner-operated local service businesses with heavy after-hours demand.";
    const saved = await setIcp(text, "Trevor");
    expect(saved).toBe(text);
    expect(getIcp()).toBe(text);
  });

  it("clears back to null (default) when set to blank", async () => {
    await ensureData();
    await setIcp("something", "Trevor");
    const cleared = await setIcp("   ", "Trevor");
    expect(cleared).toBeNull();
    expect(getIcp()).toBeNull();
  });
});
