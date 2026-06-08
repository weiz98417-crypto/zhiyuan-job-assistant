import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXCELLENT_RESUME_PATTERN_MEMORY_TYPE,
  extractExcellentResumePatterns,
} from "@/lib/excellent-resume-patterns";
import { buildExcellentResumePatternMemoryPrompt } from "@/lib/judge-engine";
import type { ReferenceResumeSection } from "@/lib/reference-resume-vector";

const sections: ReferenceResumeSection[] = [
  {
    id: "summary",
    title: "个人概述",
    content: "AI产品经理，熟悉大模型应用、RAG知识库、Agent工作流和数据产品，能从0到1推进产品落地。",
  },
  {
    id: "projects",
    title: "项目经历",
    content: "RAG知识库项目：负责召回评估、提示词工程、权限设计和灰度发布，答案准确率提升28%，跨研发、算法和运营团队完成上线闭环。",
  },
  {
    id: "skills",
    title: "专业技能",
    content: "产品规划、用户研究、SQL、Python、RAG、Prompt Engineering、A/B测试、数据指标体系。",
  },
];

describe("excellent resume pattern memory", () => {
  it("extracts reusable writing patterns with evidence and rejects low-value fragments", () => {
    const patterns = extractExcellentResumePatterns({
      sections,
      roleCategory: "ai_product_manager",
      visibility: "private",
      referenceResumeId: 42,
    });

    expect(patterns.length).toBeGreaterThanOrEqual(3);
    expect(patterns.length).toBeLessThanOrEqual(8);
    expect(patterns.map((item) => item.patternKey)).toEqual(expect.arrayContaining([
      "ai_product_technical_loop",
      "metric_result_framing",
      "cross_functional_delivery",
    ]));
    expect(patterns.every((item) => item.quote.length >= 20)).toBe(true);
    expect(patterns.some((item) => /^(业务|技术|API)$/.test(item.canonicalText))).toBe(false);
    expect(patterns[0].metadata).toMatchObject({
      roleCategory: "ai_product_manager",
      referenceResumeId: 42,
    });
  });

  it("formats abstract pattern memory separately from raw reference snippets", () => {
    const prompt = buildExcellentResumePatternMemoryPrompt([
      {
        id: 7,
        canonicalText: "AI产品经历要写成业务目标到技术链路再到产品结果的闭环。",
        confidence: 0.8,
        importance: 0.9,
        metadata: { roleCategory: "ai_product_manager", sectionTitle: "项目经历" },
      },
    ]);

    expect(prompt).toContain("Excellent Resume Abstract Pattern Memory");
    expect(prompt).toContain("not facts about the current user");
    expect(prompt).toContain("AI产品经历");
  });

  it("wires save, optimize retrieval, and feedback usage endpoints", () => {
    const importRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/cv/import-reference/route.ts"), "utf8");
    const optimizeRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/cv/optimize-section/route.ts"), "utf8");
    const preferenceRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/cv/record-preference/route.ts"), "utf8");
    const patternsLib = fs.readFileSync(path.join(process.cwd(), "src/lib/excellent-resume-patterns.ts"), "utf8");

    expect(patternsLib).toContain(EXCELLENT_RESUME_PATTERN_MEMORY_TYPE);
    expect(importRoute).toContain("persistExcellentResumePatternsBestEffort");
    expect(optimizeRoute).toContain("retrieveExcellentResumePatternMemory");
    expect(optimizeRoute).toContain("patternMemoryIds");
    expect(preferenceRoute).toContain("recordReferenceResumeUsage");
    expect(preferenceRoute).toContain("referenceMemory");
  });
});
