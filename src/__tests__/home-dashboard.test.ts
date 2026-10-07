import { describe, expect, it } from "vitest";
import { buildHomeActions, getHomeSnapshot } from "@/lib/home-dashboard";
import type { Application, InterviewSchedule } from "@/types";

const now = new Date("2026-10-07T10:00:00+08:00");

function application(overrides: Partial<Application>): Application {
  return {
    num: 1,
    date: "2026-09-20",
    company: "纸鸢科技",
    role: "AI 产品经理",
    score: 86,
    status: "evaluated",
    pdfGenerated: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("home dashboard derivations", () => {
  it("prioritizes an upcoming interview over stale follow-ups", () => {
    const interviews: InterviewSchedule[] = [{
      id: 7,
      company: "星河公司",
      role: "产品经理",
      round: 1,
      date: "2026-10-08",
      format: "video",
      checklist: [],
    }];
    const actions = buildHomeActions([
      application({ status: "interview", updatedAt: new Date("2026-09-20") }),
    ], interviews, now);

    expect(actions[0].kind).toBe("interview");
    expect(actions[1].kind).toBe("followup");
  });

  it("keeps the funnel evaluated count independent from later stages", () => {
    const snapshot = getHomeSnapshot([
      application({ status: "evaluated" }),
      application({ num: 2, status: "interview", company: "另一家公司" }),
    ], 1, 0, now);

    expect(snapshot.evaluated).toBe(1);
    expect(snapshot.applied).toBe(1);
    expect(snapshot.interviewing).toBe(1);
  });

  it("does not manufacture a score when no scored application exists", () => {
    const snapshot = getHomeSnapshot([application({ score: 0 })], 0, 0, now);
    expect(snapshot.avgScore).toBeNull();
  });
});
