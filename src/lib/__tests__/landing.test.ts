import { describe, it, expect } from "vitest";
import { rulesLanding, generateLandingContent } from "@/lib/ai/landing";

describe("landing-page content", () => {
  it("rules fallback returns a complete, vertical-aware page", () => {
    const c = rulesLanding("Med Spas");
    expect(c.vertical).toBe("Med Spas");
    expect(c.seoTitle).toMatch(/Med Spas/);
    expect(c.hero.headline).toMatch(/Med Spas/);
    expect(c.hero.primaryCta).toBeTruthy();
    expect(c.problem.bullets.length).toBeGreaterThanOrEqual(2);
    expect(c.features.length).toBeGreaterThanOrEqual(3);
    expect(c.features.every((f) => f.title && f.body)).toBe(true);
    expect(c.trust.points.length).toBeGreaterThanOrEqual(2);
    expect(c.cta.bookCta).toBeTruthy();
    expect(c.source).toBe("rules");
  });

  it("uses the provided problem line when given", () => {
    const c = rulesLanding("Dental practices", "After-hours new-patient questions go unanswered overnight.");
    expect(c.problem.body).toMatch(/new-patient/i);
  });

  it("generateLandingContent falls back to rules without a Claude key (no network)", async () => {
    const c = await generateLandingContent({ vertical: "HVAC contractors" });
    expect(c.source).toBe("rules");
    expect(c.hero.headline).toMatch(/HVAC contractors/);
    expect(c.seoTitle).toMatch(/ConversionIQ/);
  });
});
