import { describe, expect, it, vi } from "vitest";
import {
  runDurableJDEvaluation,
  type DurableJDEvaluationAdapters,
} from "@/lib/server/durable-jd-evaluation";

const JD_TEXT = "公司：纸鸢科技\n岗位：高级产品经理\n岗位职责：负责 AI 求职产品规划、用户研究、数据分析与跨团队交付，要求五年以上产品经验。";

function adapters(): DurableJDEvaluationAdapters {
  return {
    getLatestJd: vi.fn(async () => ({ body: JD_TEXT, company: "旧公司", role: "旧岗位" })),
    inspectImages: vi.fn(async () => ({ jdText: JD_TEXT, company: "图片公司", role: "图片岗位", errors: [] })),
    fetchJdUrl: vi.fn(async () => JD_TEXT),
    getResumeText: vi.fn(async () => "候选人简历"),
    getMemoryContext: vi.fn(async () => "长期记忆摘要"),
    evaluate: vi.fn(async () => ({
      date: "2026-08-24",
      company: "纸鸢科技",
      role: "高级产品经理",
      archetype: "AI 产品经理",
      overallScore: 4.2,
      legitimacy: "真实",
      blocks: { a: "职位概览", b: "简历匹配" },
      scores: { a: 4, b: 4, c: 4, d: 4, e: 4, f: 5, g: "真实" },
      keywords: ["AI", "产品规划"],
      fullMarkdown: "完整报告",
    })),
    scanRisks: vi.fn(async () => [{
      signal: "职责过宽",
      excerpt: "跨团队交付",
      severity: "medium" as const,
      source: "dictionary" as const,
    }]),
    persist: vi.fn(async () => ({
      reportNum: 12,
      jdId: 34,
      reportReadBackVerified: true,
      jdReadBackVerified: true,
    })),
  };
}

describe("durable JD evaluation", () => {
  it("prefers supplied text and returns durable read-back evidence", async () => {
    const boundary = adapters();

    const result = await runDurableJDEvaluation(
      { userId: "user-1" },
      {
        jdText: JD_TEXT,
        jdUrl: "https://example.com/job",
        images: ["data:image/png;base64,abc"],
        targetCompany: "纸鸢科技",
      },
      { adapters: boundary },
    );

    expect(boundary.inspectImages).not.toHaveBeenCalled();
    expect(boundary.fetchJdUrl).not.toHaveBeenCalled();
    expect(boundary.getLatestJd).not.toHaveBeenCalled();
    expect(boundary.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      jdText: JD_TEXT,
      cvText: "候选人简历\n\nLong-term memory context:\n长期记忆摘要",
      targetCompany: "纸鸢科技",
    }));
    expect(boundary.persist).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ jdText: JD_TEXT, company: "纸鸢科技", role: "高级产品经理" }),
    );
    expect(result).toEqual(expect.objectContaining({
      inputSource: "text",
      reportNum: 12,
      jdId: 34,
      reportReadBackVerified: true,
      jdReadBackVerified: true,
      risks: [expect.objectContaining({ signal: "职责过宽" })],
    }));
  });

  it("uses image, URL, then latest saved JD as deterministic fallbacks", async () => {
    const imageBoundary = adapters();
    await runDurableJDEvaluation(
      { userId: "user-1" },
      { images: ["data:image/png;base64,abc"], jdUrl: "https://example.com/job" },
      { adapters: imageBoundary },
    );
    expect(imageBoundary.inspectImages).toHaveBeenCalledOnce();
    expect(imageBoundary.fetchJdUrl).not.toHaveBeenCalled();

    const urlBoundary = adapters();
    await runDurableJDEvaluation(
      { userId: "user-1" },
      { jdUrl: "https://example.com/job" },
      { adapters: urlBoundary },
    );
    expect(urlBoundary.fetchJdUrl).toHaveBeenCalledOnce();
    expect(urlBoundary.getLatestJd).not.toHaveBeenCalled();

    const latestBoundary = adapters();
    await runDurableJDEvaluation(
      { userId: "user-1" },
      {},
      { adapters: latestBoundary },
    );
    expect(latestBoundary.getLatestJd).toHaveBeenCalledOnce();
  });
});
