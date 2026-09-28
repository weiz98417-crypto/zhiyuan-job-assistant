import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ScoreBadge from "@/components/design/ScoreBadge";
import { buildFallbackProfile } from "@/lib/profile-mining";
import { evaluateJobDescription } from "@/lib/server/jd-evaluation-service";
import { persistJDEvaluation } from "@/lib/server/jd-evaluation-persistence";
import { exportApplicationsMD } from "@/lib/exporters";
import { formatFivePointScore } from "@/lib/score-scale";

const jdText = "负责 AI 产品规划、用户研究、需求分析、方案设计和跨团队交付，要求有真实项目经验、数据分析能力及长期业务迭代经验。";

describe("score scale boundaries", () => {
  it("recomputes a model's 70-point JD score from valid five-point dimensions", async () => {
    const result = await evaluateJobDescription(
      { jdText },
      { completion: { complete: async () => JSON.stringify({
        company: "纸鸢科技",
        role: "产品经理",
        overallScore: 70,
        scores: { a: 4, b: 3, c: 4, d: 4, e: 4, f: 5, g: "真实" },
        blocks: { a: "职位概览", b: "简历匹配" },
      }) } },
    );

    expect(result.overallScore).toBe(3.9);
    expect(JSON.parse(result.fullMarkdown)).toMatchObject({
      overallScore: 3.9,
      scores: { a: 4, b: 3, c: 4, d: 4, e: 4, f: 5 },
    });
  });

  it("rejects an invalid JD total without usable dimensions before persistence", async () => {
    await expect(evaluateJobDescription(
      { jdText },
      { completion: { complete: async () => JSON.stringify({ overallScore: 70, scores: {} }) } },
    )).rejects.toThrow("AI 评分缺少有效的 0–5 分项");

    await expect(evaluateJobDescription(
      { jdText },
      { completion: { complete: async () => JSON.stringify({ overallScore: 4.2, scores: {} }) } },
    )).rejects.toThrow("AI 评分缺少有效的 0–5 分项");

    await expect(evaluateJobDescription(
      { jdText },
      { completion: { complete: async () => JSON.stringify({ overallScore: 70, scores: { a: 0 } }) } },
    )).rejects.toThrow("AI 评分缺少有效的 0–5 分项");

    await expect(evaluateJobDescription(
      { jdText },
      { completion: { complete: async () => JSON.stringify({ overallScore: 4.5, scores: { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 } }) } },
    )).rejects.toThrow("AI 评分缺少有效的 0–5 分项");

    await expect(persistJDEvaluation(
      { userId: "score-test" },
      { company: "纸鸢科技", role: "产品经理", overallScore: 70 },
    )).rejects.toThrow("JD 评分必须在 0–5 分之间");
  });

  it("keeps a bad historical average from turning profile competition into 276", () => {
    const stats = {
      totalApplications: 4,
      passRate: 25,
      statusDistribution: {},
      avgScore: 13.8,
      industryDistribution: {},
      companySizeHints: { large: 0, sme: 0, startup: 0 },
      totalPracticeCount: 0,
      practiceByCategory: {},
    };

    expect(buildFallbackProfile(stats).marketFit.overallScore).toBe(0);
    expect(buildFallbackProfile({ ...stats, avgScore: 4.1 }).marketFit.overallScore).toBe(82);
  });

  it("marks historical out-of-range scores for review with neutral styling", () => {
    const html = renderToStaticMarkup(<ScoreBadge score={70} />);

    expect(formatFivePointScore(70)).toBe("待复核");
    expect(formatFivePointScore(4.5)).toBe("4.5/5");
    expect(html).toContain("待复核");
    expect(html).toContain("bg-[var(--color-divider)]");
    expect(html).not.toContain("70.0");
    expect(html).not.toContain("/5");
  });

  it("does not export a historical 70 as a five-point application score", () => {
    const markdown = exportApplicationsMD([{
      num: 1,
      date: "2026-09-27",
      company: "纸鸢科技",
      role: "产品经理",
      score: 70,
      status: "evaluated",
      pdfGenerated: false,
      createdAt: new Date("2026-09-27"),
      updatedAt: new Date("2026-09-27"),
    }]);

    expect(markdown).toContain("待复核");
    expect(markdown).not.toContain("70.0/5");
  });
});
