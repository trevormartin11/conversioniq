import { describe, it, expect } from "vitest";
import { ensureData, getVariants, updateVariant } from "@/lib/data/store";

describe("updateVariant — inline campaign copy editing", () => {
  it("persists subject + body edits", async () => {
    await ensureData();
    const v = getVariants()[0];
    expect(v).toBeTruthy();
    const updated = await updateVariant(v.id, { subject: "new subject xyz", body: "new body abc" }, "Trevor");
    expect(updated?.subject).toBe("new subject xyz");
    expect(getVariants().find((x) => x.id === v.id)?.body).toBe("new body abc");
  });

  it("returns null for an unknown variant", async () => {
    await ensureData();
    expect(await updateVariant("nope_xyz", { subject: "x" })).toBeNull();
  });
});
