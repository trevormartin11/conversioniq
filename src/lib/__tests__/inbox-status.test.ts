import { describe, it, expect } from "vitest";
import { mapInboxStatus } from "@/lib/sync/inboxes";

describe("mapInboxStatus — Instantly account -> inbox status", () => {
  it("a warming account (score < 80) is 'warming', not 'paused'", () => {
    expect(mapInboxStatus({ status: 1, stat_warmup_score: 42 }).status).toBe("warming");
  });

  it("treats string status '1' as active (the bug that zeroed out warming)", () => {
    expect(mapInboxStatus({ status: "1", stat_warmup_score: 42 }).status).toBe("warming");
    expect(mapInboxStatus({ status: "1", stat_warmup_score: 95 }).status).toBe("active");
  });

  it("missing status does NOT silently become paused", () => {
    expect(mapInboxStatus({ stat_warmup_score: 50 }).status).toBe("warming");
    expect(mapInboxStatus({ stat_warmup_score: 88 }).status).toBe("active");
  });

  it("a definite non-active numeric status is paused", () => {
    expect(mapInboxStatus({ status: 2, stat_warmup_score: 90 }).status).toBe("paused");
    expect(mapInboxStatus({ status: "-1", stat_warmup_score: 90 }).status).toBe("paused");
  });

  it("setup_pending forces warming regardless of score; string score parses", () => {
    expect(mapInboxStatus({ status: 1, stat_warmup_score: 95, setup_pending: true }).status).toBe("warming");
    expect(mapInboxStatus({ status: 1, stat_warmup_score: "30" as unknown as number }).status).toBe("warming");
  });
});
