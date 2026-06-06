import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyStage } from "@/lib/outcome";

afterEach(() => vi.unstubAllEnvs());

describe("classifyStage — CIQ deal stage → terminal outcome", () => {
  it("maps the default won/lost stage names", () => {
    expect(classifyStage("Closed Won")).toBe("won");
    expect(classifyStage("Closed Lost")).toBe("lost");
  });

  it("treats in-flight stages and empty input as not-yet-terminal", () => {
    expect(classifyStage("Demo Scheduled")).toBe(null);
    expect(classifyStage("Onboarding Complete/Free Trial")).toBe(null);
    expect(classifyStage("")).toBe(null);
    expect(classifyStage(null)).toBe(null);
    expect(classifyStage(undefined)).toBe(null);
  });

  it("matches won/lost keywords case-insensitively", () => {
    expect(classifyStage("WON — contract signed")).toBe("won");
    expect(classifyStage("Deal Lost")).toBe("lost");
    expect(classifyStage("Disqualified")).toBe("lost");
    expect(classifyStage("Dead")).toBe("lost");
  });

  it("honors custom stage names from env (without breaking the defaults)", () => {
    vi.stubEnv("ZOHO_CIQ_WON_STAGE", "Onboarding Complete/Free Trial");
    expect(classifyStage("Onboarding Complete/Free Trial")).toBe("won");
    expect(classifyStage("Closed Won")).toBe("won"); // keyword fallback still holds
    expect(classifyStage("Demo Scheduled")).toBe(null);
  });
});
