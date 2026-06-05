import { describe, it, expect } from "vitest";
import { classifyCell } from "@/lib/data/queries";

describe("classifyCell — realized conversion -> sourcing move", () => {
  it("scales a cell that closes at >=2%", () => {
    expect(classifyCell({ leads: 100, closed: 3, closeRate: 0.03, mrr: 3000 }).action).toBe("scale");
  });
  it("cuts a cell with enough volume but zero closes", () => {
    expect(classifyCell({ leads: 80, closed: 0, closeRate: 0, mrr: 0 }).action).toBe("cut");
  });
  it("holds a low-volume cell (not enough data)", () => {
    expect(classifyCell({ leads: 10, closed: 0, closeRate: 0, mrr: 0 }).action).toBe("hold");
  });
  it("holds a cell converting below the scale bar", () => {
    expect(classifyCell({ leads: 100, closed: 1, closeRate: 0.01, mrr: 500 }).action).toBe("hold");
  });
});
