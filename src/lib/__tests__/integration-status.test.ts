import { describe, it, expect } from "vitest";
import { integrationStatuses } from "@/lib/integrations";

describe("integrationStatuses — reflects the full current stack", () => {
  it("surfaces the integrations added this session", () => {
    const keys = integrationStatuses().map((s) => s.key);
    for (const k of ["zohoCiq", "outscraper", "millionverifier", "namecheap", "gmail"]) {
      expect(keys).toContain(k);
    }
  });

  it("every status has a label + role", () => {
    for (const s of integrationStatuses()) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.role.length).toBeGreaterThan(0);
    }
  });
});
