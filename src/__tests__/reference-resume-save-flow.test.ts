import { describe, expect, it } from "vitest";
import {
  buildPendingReferenceResumeSave,
  buildPendingReferenceResumeSaveFromImage,
  buildReferenceResumeRoleQuestion,
  completePendingReferenceResumeSave,
  inferReferenceResumeVisibility,
  isPendingReferenceResumeSaveCancelled,
} from "@/lib/agent/reference-resume-save-flow";
import type { ImageIntakeResult } from "@/lib/agent/image-intake";

const resumeText = `
张三
个人概述：AI产品经理，熟悉大模型应用、RAG知识库、数据产品和端到端产品落地。

教育经历：浙江大学 计算机科学 硕士，主修机器学习、软件工程、数据挖掘。

工作经历：在某科技公司负责AI助手产品，从0到1推进需求调研、PRD、数据看板和跨部门协作，月活提升35%。

项目经历：
RAG知识库项目：完成召回评估、提示词工程、权限设计和灰度发布，答案准确率提升28%。
多模态分析项目：设计图片识别链路、异常兜底和质量评估闭环，处理效率提升40%。

专业技能：产品规划、用户研究、SQL、Python、RAG、Prompt Engineering、A/B测试、数据指标体系。
`.repeat(2);

describe("reference resume save pending flow", () => {
  it("stores extracted resume text and asks exactly one role-category question when missing", () => {
    const intake: ImageIntakeResult = {
      documentType: "resume",
      confidence: 0.92,
      quality: "clear",
      extractedText: resumeText,
    };

    const pending = buildPendingReferenceResumeSaveFromImage("把这份简历保存成优秀简历", 1, intake, "2026-06-08T00:00:00.000Z");

    expect(pending?.resumeText).toContain("RAG知识库项目");
    expect(pending?.roleCategory).toBeUndefined();
    expect(pending?.suggestedRoleCategory).toBe("ai_product_manager");
    expect(pending?.visibility).toBe("private");

    const question = buildReferenceResumeRoleQuestion(pending!);
    expect(question).toContain("更像「AI产品经理」方向");
    expect(question).toContain("直接回复「确认」");
    expect(question).toContain("AI产品经理");
    expect(question).toContain("私有优秀简历");
    expect(question).toContain("团队共享");
  });

  it("completes the pending save from the next role-category answer", () => {
    const pending = buildPendingReferenceResumeSave({
      userText: "保存成优秀简历",
      resumeText,
      source: "paste",
      createdAt: "2026-06-08T00:00:00.000Z",
    });

    const completed = completePendingReferenceResumeSave(pending!, "AI产品经理");

    expect(completed).toMatchObject({
      resume_text: expect.stringContaining("RAG知识库项目"),
      role_category: "ai_product_manager",
      visibility: "private",
    });
  });

  it("uses suggested role only after user confirmation", () => {
    const pending = buildPendingReferenceResumeSave({
      userText: "保存成优秀简历",
      resumeText,
      source: "paste",
      createdAt: "2026-06-08T00:00:00.000Z",
    });

    expect(pending?.roleCategory).toBeUndefined();
    expect(pending?.suggestedRoleCategory).toBe("ai_product_manager");
    expect(completePendingReferenceResumeSave(pending!, "确认")).toMatchObject({
      role_category: "ai_product_manager",
      visibility: "private",
    });
  });

  it("can confirm the suggested role and request team sharing in the same answer", () => {
    const pending = buildPendingReferenceResumeSave({
      userText: "保存成优秀简历",
      resumeText,
      source: "paste",
      createdAt: "2026-06-08T00:00:00.000Z",
    });

    expect(completePendingReferenceResumeSave(pending!, "确认，团队共享")).toMatchObject({
      role_category: "ai_product_manager",
      visibility: "team",
    });
  });

  it("uses team visibility only when sharing is explicit", () => {
    expect(inferReferenceResumeVisibility("保存成AI运营优秀简历")).toBe("private");
    expect(inferReferenceResumeVisibility("保存成AI运营优秀简历，局域网共享给团队")).toBe("team");
  });

  it("recognizes cancellation answers", () => {
    expect(isPendingReferenceResumeSaveCancelled("算了，不要存")).toBe(true);
  });
});
