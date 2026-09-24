import { describe, expect, it } from "vitest";
import {
  buildImageIntakeToolCall,
  inferPreferredDocumentTypeFromText,
  resolveImageIntakeAgentId,
  type ImageIntakeResult,
} from "@/lib/agent/image-intake";
import { routeImageIntake } from "@/lib/agent/image-intake-router";

const images = ["data:image/png;base64,abc"];

describe("generic image intake routing", () => {
  it("routes recognized JD images to the JD evaluation agent and tool", () => {
    const intake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.92,
      extractedText: "岗位职责：负责 AI 产品规划、需求分析、数据产品设计与跨团队落地。\n岗位要求：熟悉数据产品和大模型应用，有完整项目推进经验。",
      structured: { company: "字节跳动", role: "AI 产品经理" },
    };

    expect(resolveImageIntakeAgentId("帮我评估这个截图", intake)).toBe("evaluate");

    const call = buildImageIntakeToolCall("帮我评估一个JD", images, intake, ["evaluate_jd_full"]);
    expect(call?.name).toBe("evaluate_jd_full");
    expect(call?.params.jd_text).toContain("岗位职责");
    expect(call?.params.target_company).toBe("字节跳动");
  });

  it("routes recognized Offer images to the Offer agent and tool", () => {
    const intake: ImageIntakeResult = {
      documentType: "offer",
      confidence: 0.9,
      extractedText: "公司：腾讯\n岗位：产品经理\n薪资：30K * 15\n试用期：3个月",
      structured: { company: "腾讯", role: "产品经理", monthlySalary: 30, monthsPerYear: 15 },
    };

    expect(resolveImageIntakeAgentId("帮我评估这个 Offer 截图", intake)).toBe("offer");

    const call = buildImageIntakeToolCall("帮我评估这个 Offer", images, intake, ["evaluate_offer"]);
    expect(call?.name).toBe("evaluate_offer");
    expect(call?.params.offerText).toContain("薪资");
    expect(call?.params.company).toBe("腾讯");
    expect(call?.params.monthlySalary).toBe(30);
  });

  it("does not blindly evaluate unknown screenshots", () => {
    const intake: ImageIntakeResult = {
      documentType: "unknown",
      confidence: 0.25,
      extractedText: "",
      reason: "图片内容不足以稳定分类",
    };

    expect(resolveImageIntakeAgentId("帮我看看这个截图", intake)).toBeUndefined();
    expect(buildImageIntakeToolCall("帮我看看这个截图", images, intake, ["evaluate_jd_full", "evaluate_offer"])).toBeNull();
  });

  it("does not bypass image recognition for JD image turns when intake is unavailable", () => {
    const preferred = inferPreferredDocumentTypeFromText("帮我评估一个JD");
    expect(preferred).toBe("jd");
    expect(resolveImageIntakeAgentId("帮我评估一个JD", null, preferred)).toBe("evaluate");

    const call = buildImageIntakeToolCall("帮我评估一个JD", images, null, ["evaluate_jd_full"], preferred);
    expect(call).toBeNull();
  });

  it("does not bypass image recognition for Offer image turns when intake is unavailable", () => {
    const preferred = inferPreferredDocumentTypeFromText("帮我评估这个 offer 截图");
    expect(preferred).toBe("offer");
    expect(resolveImageIntakeAgentId("帮我评估这个 offer 截图", null, preferred)).toBe("offer");

    const call = buildImageIntakeToolCall("帮我评估这个 offer 截图", images, null, ["evaluate_offer"], preferred);
    expect(call).toBeNull();
  });

  it("image-only input classifies before generic chat and asks user intent", () => {
    const intake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.92,
      quality: "clear",
      extractedText: "职位职责：负责 AI 产品规划、需求分析、数据产品设计与落地。岗位要求：熟悉大模型应用和产品闭环。",
    };

    const decision = routeImageIntake("", intake);
    expect(decision.route).toBe("clarify_intent");
    expect(decision.clarificationQuestion).toContain("JD");
  });

  it("JD text plus JD image routes to JD evaluation", () => {
    const intake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.91,
      quality: "clear",
      extractedText: "岗位职责：负责数据产品规划与 BI 平台建设。任职要求：熟悉主数据、数仓、指标体系。",
    };

    expect(routeImageIntake("帮我评估这个JD", intake).route).toBe("evaluate_jd");
  });

  it("Offer text plus Offer image routes to Offer evaluation", () => {
    const intake: ImageIntakeResult = {
      documentType: "offer",
      confidence: 0.91,
      quality: "clear",
      extractedText: "公司：腾讯\n岗位：产品经理\n薪资：30K * 15\n试用期：3个月",
    };

    expect(routeImageIntake("帮我评估这个offer", intake).route).toBe("evaluate_offer");
  });

  it("JD text plus Offer image asks for clarification", () => {
    const intake: ImageIntakeResult = {
      documentType: "offer",
      confidence: 0.91,
      quality: "clear",
      extractedText: "公司：腾讯\n岗位：产品经理\n薪资：30K * 15\n试用期：3个月",
    };

    const decision = routeImageIntake("帮我评估这个JD", intake);
    expect(decision.route).toBe("clarify_intent");
    expect(decision.clarificationQuestion).toContain("Offer");
  });

  it("resume screenshot evaluation enters read-only diagnosis", () => {
    const intake: ImageIntakeResult = {
      documentType: "resume",
      confidence: 0.88,
      quality: "clear",
      extractedText: "张三\n教育经历：硕士\n项目经历：AI 硬件与计算机视觉项目",
    };

    const decision = routeImageIntake("请评估这份简历", intake);
    expect(decision.route).toBe("resume_diagnosis");
  });

  it("resume screenshot plus excellent-resume save intent calls the reference save tool", () => {
    const intake: ImageIntakeResult = {
      documentType: "resume",
      confidence: 0.9,
      quality: "clear",
      extractedText: "张三\n个人概述：AI产品经理，熟悉大模型应用与数据产品。\n教育经历：硕士。\n工作经历：负责AI助手产品从0到1落地。\n项目经历：RAG知识库项目，答案准确率提升28%。\n专业技能：SQL、Prompt Engineering、用户研究、产品规划。",
    };

    const call = buildImageIntakeToolCall(
      "把这份简历保存成AI产品经理优秀简历，并团队共享",
      images,
      intake,
      ["save_reference_resume"],
    );

    expect(call?.name).toBe("save_reference_resume");
    expect(call?.params.resume_text).toContain("RAG知识库项目");
    expect(call?.params.role_category).toBe("AI产品经理");
    expect(call?.params.visibility).toBe("team");
  });

  it("resume screenshot save intent without explicit role does not directly save", () => {
    const intake: ImageIntakeResult = {
      documentType: "resume",
      confidence: 0.9,
      quality: "clear",
      structured: { roleCategory: "AI产品经理" },
      extractedText: "张三\n个人概述：AI产品经理，熟悉大模型应用与数据产品。\n教育经历：硕士。\n工作经历：负责AI助手产品从0到1落地。\n项目经历：RAG知识库项目，答案准确率提升28%。\n专业技能：SQL、Prompt Engineering、用户研究、产品规划。",
    };

    const call = buildImageIntakeToolCall(
      "把这份简历保存成优秀简历",
      images,
      intake,
      ["save_reference_resume"],
    );

    expect(call).toBeNull();
  });

  it("unrelated screenshots stay outside JD/Offer/resume flows", () => {
    const intake: ImageIntakeResult = {
      documentType: "chat_screenshot",
      confidence: 0.86,
      quality: "clear",
      extractedText: "聊天记录：晚上几点开会？",
    };

    const decision = routeImageIntake("帮我看看这张图", intake);
    expect(decision.route).toBe("describe_image");
  });

  it("plain chat screenshots do not get treated as broken thumbnails", () => {
    const intake: ImageIntakeResult = {
      documentType: "chat_screenshot",
      confidence: 0.9,
      quality: "clear",
      extractedText: "聊天记录：晚上几点开会？",
      reason: "chat screenshot",
    };

    const decision = routeImageIntake("帮我看看这张图", intake);
    expect(decision.route).toBe("describe_image");
  });

  it("low-confidence thumbnails ask for a clearer image", () => {
    const intake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.55,
      quality: "thumbnail",
      extractedText: "职位",
    };

    const decision = routeImageIntake("帮我评估这个JD", intake);
    expect(decision.route).toBe("retry_image");
    expect(decision.retryHint).toContain("JD");
  });

  it("treats OCR timeout as a transient service failure instead of blaming image clarity", () => {
    const intake: ImageIntakeResult = {
      documentType: "unknown",
      confidence: 0,
      quality: "unknown",
      extractedText: "",
      reason: "OCR request failed: The operation was aborted due to timeout",
      errors: ["ocr_timeout"],
      perImage: [{
        index: 0,
        documentType: "unknown",
        confidence: 0,
        extractedTextLength: 0,
        reason: "OCR request failed: The operation was aborted due to timeout",
        candidate: "整图规范化",
      }],
    };

    const decision = routeImageIntake("帮我评估这个JD", intake);

    expect(decision.route).toBe("retry_image");
    expect(decision.reason).toContain("超时");
    expect(decision.retryHint).toContain("稍后");
    expect(decision.retryHint).not.toContain("更清晰");
    expect(decision.retryHint).not.toContain("裁剪到只保留正文");
  });

  it("continues JD evaluation when another uploaded image timed out", () => {
    const intake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.88,
      quality: "clear",
      extractedText: "岗位职责：负责数据产品规划、指标体系建设与跨团队落地。任职要求：熟悉 SQL、数据仓库和大模型应用。",
      reason: "识别到 JD；第 2 张图片 OCR 超时",
      errors: ["第 2 张：ocr_timeout"],
      perImage: [
        {
          index: 0,
          documentType: "jd",
          confidence: 0.88,
          extractedTextLength: 62,
          reason: "原图识别完成",
          candidate: "第 1 张原图",
        },
        {
          index: 1,
          documentType: "unknown",
          confidence: 0,
          extractedTextLength: 0,
          reason: "OCR request timeout",
          candidate: "第 2 张原图",
        },
      ],
    };

    const decision = routeImageIntake("帮我评估这个JD", intake);

    expect(decision.route).toBe("evaluate_jd");
    expect(decision.reason).toContain("部分图片超时");
    expect(decision.retryHint).toContain("第 2 张图片");
  });

  it("continues resume diagnosis from usable text when another image timed out", () => {
    const intake: ImageIntakeResult = {
      documentType: "resume",
      confidence: 0.86,
      quality: "clear",
      extractedText: "张三\n教育经历：硕士\n项目经历：负责 AI 产品从 0 到 1 落地，提升转化率 28%。",
      errors: ["第 2 张：ocr_timeout"],
      perImage: [
        {
          index: 0,
          documentType: "resume",
          confidence: 0.86,
          extractedTextLength: 48,
          reason: "第 1 张识别完成",
        },
        {
          index: 1,
          documentType: "unknown",
          confidence: 0,
          extractedTextLength: 0,
          reason: "OCR request timeout",
        },
      ],
    };

    const decision = routeImageIntake("请评估这份简历", intake);

    expect(decision.route).toBe("resume_diagnosis");
    expect(decision.reason).toContain("部分图片超时");
    expect(decision.retryHint).toContain("第 2 张图片");
  });

  it("does not report a missing page when a timed-out OCR candidate recovered", () => {
    const intake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.9,
      quality: "clear",
      extractedText: "岗位职责：负责数据产品规划和指标体系建设。任职要求：熟悉 SQL、数据仓库和跨团队沟通。",
      errors: ["整图 OCR 超时，分段识别成功"],
      perImage: [{
        index: 0,
        documentType: "jd",
        confidence: 0.9,
        extractedTextLength: 46,
        reason: "分段识别成功",
      }],
    };

    const decision = routeImageIntake("帮我评估这个JD", intake);

    expect(decision.route).toBe("evaluate_jd");
    expect(decision.reason).not.toContain("部分图片超时");
    expect(decision.retryHint).toBeUndefined();
  });
});
