import { describe, expect, it } from "vitest";
import {
  normalizeInterviewJDs,
  resolveSelectedInterviewJD,
} from "@/lib/agent/interview-launch-materials";

describe("interview JD selection regression", () => {
  it("keeps the selected JD card in sync when PostgreSQL returns string ids", () => {
    const jds = normalizeInterviewJDs([
      {
        id: "42",
        company: "示例公司",
        role: "AI 产品经理",
        body: "负责 AI 产品规划",
      },
    ]);

    expect(jds[0]?.id).toBe(42);
    expect(resolveSelectedInterviewJD(jds, 42)).toMatchObject({
      company: "示例公司",
      role: "AI 产品经理",
    });
  });

  it("drops invalid ids instead of rendering a selector value with no matching card", () => {
    const jds = normalizeInterviewJDs([
      { id: "not-a-number", company: "坏数据", role: "未知" },
      { id: 7, company: "有效公司", role: "产品经理" },
    ]);

    expect(jds).toHaveLength(1);
    expect(resolveSelectedInterviewJD(jds, 7)?.company).toBe("有效公司");
  });
});
