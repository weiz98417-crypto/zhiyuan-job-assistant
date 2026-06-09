import { describe, expect, it } from "vitest";
import {
  buildPendingReferenceResumeSave,
  buildPendingReferenceResumeSaveFromImage,
  completePendingReferenceResumeSave,
} from "@/lib/agent/reference-resume-save-flow";
import type { ImageIntakeResult } from "@/lib/agent/image-intake";
import {
  buildReferenceResumeRetrievalQuery,
  computeReferenceSnippetScore,
} from "@/lib/reference-resume-vector";
import { createDeterministicEmbedding } from "@/lib/memory/vector-memory";
import { extractExcellentResumePatterns } from "@/lib/excellent-resume-patterns";

const resumeText = `
李四
个人概述：AI产品经理，熟悉大模型应用、RAG知识库、Agent工作流和数据产品，能从0到1推进产品落地。
教育经历：计算机科学硕士，主修机器学习、软件工程、数据挖掘。
工作经历：负责AI助手产品，从0到1推进需求调研、PRD、数据看板和跨部门协作，月活提升35%。
项目经历：RAG知识库项目，完成召回评估、提示词工程、权限设计和灰度发布，答案准确率提升28%。
专业技能：产品规划、用户研究、SQL、Python、RAG、Prompt Engineering、A/B测试、数据指标体系。
`.repeat(2);

describe("excellent resume memory evolution evals", () => {
  it("baseline: pasted excellent resume with role category can complete a save action", () => {
    const pending = buildPendingReferenceResumeSave({
      userText: "把这份简历保存成AI产品经理优秀简历",
      resumeText,
      source: "paste",
    });

    expect(pending?.roleCategory).toBe("ai_product_manager");
    const completed = completePendingReferenceResumeSave(pending!, "确认保存");
    expect(completed).toMatchObject({
      role_category: "ai_product_manager",
      visibility: "private",
    });
  });

  it("baseline: screenshot-extracted resume without role category asks a follow-up while preserving text", () => {
    const intake: ImageIntakeResult = {
      documentType: "resume",
      confidence: 0.9,
      quality: "clear",
      extractedText: resumeText,
    };

    const pending = buildPendingReferenceResumeSaveFromImage("保存成优秀简历", 1, intake);

    expect(pending?.resumeText).toContain("RAG知识库项目");
    expect(pending?.roleCategory).toBeUndefined();
    expect(pending?.suggestedRoleCategory).toBe("ai_product_manager");
    expect(completePendingReferenceResumeSave(pending!, "AI运营")).toMatchObject({
      role_category: "ai_operations",
    });
  });

  it("boundary: non-resume screenshots do not enter excellent-resume save flow", () => {
    const jd: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.95,
      quality: "clear",
      extractedText: "岗位职责：负责AI产品规划。任职要求：熟悉数据产品。",
    };
    const offer: ImageIntakeResult = {
      documentType: "offer",
      confidence: 0.95,
      quality: "clear",
      extractedText: "公司：某科技。薪资：30K*15。",
    };
    const unrelated: ImageIntakeResult = {
      documentType: "chat_screenshot",
      confidence: 0.9,
      quality: "clear",
      extractedText: "晚上几点开会？",
    };

    expect(buildPendingReferenceResumeSaveFromImage("保存成优秀简历", 1, jd)).toBeNull();
    expect(buildPendingReferenceResumeSaveFromImage("保存成优秀简历", 1, offer)).toBeNull();
    expect(buildPendingReferenceResumeSaveFromImage("保存成优秀简历", 1, unrelated)).toBeNull();
  });

  it("boundary: private retrieval is owner scoped while approved team references can be shared", () => {
    const query = buildReferenceResumeRetrievalQuery({
      queryEmbedding: createDeterministicEmbedding("AI产品经理 RAG 项目"),
      userId: "user-a",
      roleCategory: "AI产品经理",
      limit: 3,
    });

    expect(query.sql).toContain("((c.owner_user_id = $2 AND c.visibility IN ('private','team_pending','team')) OR c.visibility = 'team')");
    expect(query.params[1]).toBe("user-a");
  });

  it("regression: accepted references rank up and rejected references rank down", () => {
    const neutral = computeReferenceSnippetScore({ similarity: 0.82, quality: 0.82, roleScore: 1 });
    const accepted = computeReferenceSnippetScore({ similarity: 0.82, quality: 0.82, roleScore: 1, acceptedCount: 6 });
    const rejected = computeReferenceSnippetScore({ similarity: 0.82, quality: 0.82, roleScore: 1, rejectedCount: 6 });

    expect(accepted).toBeGreaterThan(neutral);
    expect(rejected).toBeLessThan(neutral);
  });

  it("regression: pattern extraction produces abstract memory instead of copied resume text", () => {
    const patterns = extractExcellentResumePatterns({
      sections: [{ id: "projects", title: "项目经历", content: resumeText }],
      roleCategory: "ai_product_manager",
      referenceResumeId: 1,
    });

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].canonicalText).not.toContain("李四");
    expect(patterns[0].canonicalText).not.toContain("答案准确率提升28%");
    expect(patterns[0].quote).toContain("RAG");
  });
});
