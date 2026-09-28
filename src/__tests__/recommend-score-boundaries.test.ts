import { describe, expect, it, vi } from "vitest";

const reports = vi.hoisted(() => [
  { id: 1, reportNum: 1, company: "旧公司", role: "产品经理", date: "2026-09-26", overallScore: 70, keywords: [] },
  { id: 2, reportNum: 2, company: "纸鸢科技", role: "产品经理", date: "2026-09-27", overallScore: 4.1, keywords: [] },
]);

vi.mock("@/lib/db", () => ({
  default: {
    reports: { where: () => ({ aboveOrEqual: () => ({ toArray: async () => reports }) }) },
    applications: { toArray: async () => [] },
  },
}));
vi.mock("@/lib/profile-storage", () => ({ loadProfile: async () => null }));
vi.mock("@/lib/cv-storage", () => ({ getCVFullText: async () => "" }));
vi.mock("@/lib/agent/memory", () => ({ loadPreferences: async () => null, getPreferenceBonus: () => 0 }));

import { getRecommendations } from "@/lib/recommend";

describe("recommendation score boundaries", () => {
  it("excludes a historical 70/5 report before ranking and percentage conversion", async () => {
    const result = await getRecommendations(3);

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      company: "纸鸢科技",
      matchScore: 82,
      reportId: 2,
    });
  });
});
