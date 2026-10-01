import { describe, expect, it } from "vitest";
import {
  digestScheduleDecision,
  nextWeeklyMonday0800Utc,
} from "@/lib/agent/runtime/scheduled-runs";

describe("Spec 19: weekly Monday 08:00 Asia/Shanghai scheduling math", () => {
  it("returns the next Monday 00:00 UTC (= Monday 08:00 CST) for a mid-week instant", () => {
    // 2026-10-01 是周四（UTC 06:00 == CST 14:00）。
    expect(nextWeeklyMonday0800Utc(new Date("2026-10-01T06:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("rolls forward a full week from an exact Monday 08:00 CST instant", () => {
    expect(nextWeeklyMonday0800Utc(new Date("2026-10-05T00:00:00Z")).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("lands on the immediately following Monday from Sunday night", () => {
    expect(nextWeeklyMonday0800Utc(new Date("2026-10-04T23:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});

describe("Spec 19: digest schedule decision (catch-up, idempotency, active-run guard)", () => {
  const base = { hasActiveDigestRun: false };
  const due = "2026-10-05T00:00:00.000Z";

  it("is a no-op before the schedule is due", () => {
    expect(digestScheduleDecision({ ...base, nextRunAt: due }, new Date("2026-10-04T23:59:59Z")).action).toBe("noop");
  });

  it("triggers within the catch-up window with a stable idempotency key", () => {
    const decision = digestScheduleDecision({ ...base, nextRunAt: due }, new Date("2026-10-05T09:00:00Z"));
    expect(decision).toEqual({ action: "trigger", dueAtIso: due });
  });

  it("skips with a visible note when the window is missed by more than 24h", () => {
    const decision = digestScheduleDecision({ ...base, nextRunAt: due }, new Date("2026-10-06T01:00:00Z"));
    expect(decision.action).toBe("skip_missed");
    expect(decision.action === "skip_missed" && decision.note.length > 0).toBe(true);
  });

  it("skips while an unattended digest run is still active", () => {
    const decision = digestScheduleDecision({ ...base, hasActiveDigestRun: true, nextRunAt: due }, new Date("2026-10-05T01:00:00Z"));
    expect(decision.action).toBe("skip_active_run");
  });
});
