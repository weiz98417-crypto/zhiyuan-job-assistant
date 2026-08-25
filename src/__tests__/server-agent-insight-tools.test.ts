import { beforeEach, describe, expect, it, vi } from "vitest";

const insightService = vi.hoisted(() => ({
  getPipelineHealthForUser: vi.fn(),
  getSkillGapContextForUser: vi.fn(),
  getProfileInsightsForUser: vi.fn(),
  getRecommendationsForUser: vi.fn(),
}));

vi.mock("@/lib/server/agent-insight-service", () => insightService);

import { checkPipelineHealth } from "@/lib/agent/tools/query/check-pipeline-health";
import { detectSkillGaps } from "@/lib/agent/tools/query/detect-skill-gaps";
import { getProfileInsights } from "@/lib/agent/tools/query/get-profile-insights";
import { getRecommendations } from "@/lib/agent/tools/query/get-recommendations";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  allowlist: ["check_pipeline_health", "detect_skill_gaps", "get_profile_insights", "get_recommendations"],
};

describe("principal-scoped insight tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("HTTP must not be used"));
  });

  it("reads pipeline health from the server projection", async () => {
    insightService.getPipelineHealthForUser.mockResolvedValue({ overdue: [], healthy: 2, total: 2 });
    const result = await checkPipelineHealth.handler({ days_threshold: 7 }, context);
    expect(insightService.getPipelineHealthForUser).toHaveBeenCalledWith({ userId: "user-1" }, 7);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, data: { total: 2 } });
  });

  it("builds skill-gap context from user-owned resume, report, and memory", async () => {
    insightService.getSkillGapContextForUser.mockResolvedValue({
      jdText: "完整 JD",
      cvText: "完整简历",
      memorySummary: "长期记忆",
    });
    const result = await detectSkillGaps.handler({ reportNum: 12 }, context);
    expect(insightService.getSkillGapContextForUser).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ reportNum: 12 }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("reads profile insights and recommendations without browser storage", async () => {
    insightService.getProfileInsightsForUser.mockResolvedValue({ signalCount: 12, semanticContext: "画像", hasEnoughData: true });
    insightService.getRecommendationsForUser.mockResolvedValue({
      profile: { skills: ["AI"] },
      activity: { totalApplications: 2 },
      recentApps: [],
    });
    const insights = await getProfileInsights.handler({}, context);
    const recommendations = await getRecommendations.handler({ limit: 5 }, context);
    expect(insights.success).toBe(true);
    expect(recommendations.success).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
