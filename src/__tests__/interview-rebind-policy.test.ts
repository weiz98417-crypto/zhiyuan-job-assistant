import { describe, expect, it } from "vitest";
import {
  classifyInterviewMaterialReference,
  matchInterviewMaterialReference,
  type InterviewMaterialRecord,
} from "@/lib/agent/interview-rebind-policy";

const records: InterviewMaterialRecord[] = [
  {
    id: 7,
    kind: "jd",
    company: "腾讯",
    role: "AI 产品经理",
    title: "腾讯 AI 产品经理 JD",
    keywords: ["商业化", "模型评估"],
    body: "负责 AI 商业化产品和模型效果评估。",
  },
  {
    id: 23,
    kind: "resume",
    name: "增长产品简历",
    title: "增长产品简历",
    body: "增长实验、数据分析、推荐系统。",
  },
];

describe("interview material reference classifier", () => {
  it("keeps the current session when no JD or resume reference appears", () => {
    const decision = classifyInterviewMaterialReference("继续刚才那道题，我再补充一个例子");

    expect(decision.intent).toBe("continue_current_session");
    expect(decision.confidence).toBe("high");
  });

  it("treats contextual JD mentions as supporting context", () => {
    const decision = classifyInterviewMaterialReference("也参考一下腾讯 AI PM JD 里的商业化要求，但先别重开");

    expect(decision.intent).toBe("use_as_supporting_context");
    expect(decision.materialKind).toBe("jd");
    expect(decision.confidence).toBe("high");
  });

  it("detects explicit named material switches", () => {
    const decision = classifyInterviewMaterialReference("切换到 #23 这份简历，后面按它来问");

    expect(decision.intent).toBe("switch_active_material");
    expect(decision.materialKind).toBe("resume");
    expect(decision.explicit).toBe(true);
  });

  it("detects explicit restart requests", () => {
    const decision = classifyInterviewMaterialReference("换成《字节 AI 产品经理 JD》并重新开始一场模拟面试");

    expect(decision.intent).toBe("restart_as_new_interview");
    expect(decision.materialKind).toBe("jd");
    expect(decision.confidence).toBe("high");
  });

  it("asks for clarification on ambiguous other-material wording", () => {
    const decision = classifyInterviewMaterialReference("用另一份简历吧");

    expect(decision.intent).toBe("needs_clarification");
    expect(decision.materialKind).toBe("resume");
    expect(decision.explicit).toBe(false);
  });

  it("does not silently switch on weak material mentions", () => {
    const decision = classifyInterviewMaterialReference("这个 JD 里好像也提到了数据分析");

    expect(decision.intent).toBe("use_as_supporting_context");
    expect(decision.confidence).toBe("low");
    expect(decision.explicit).toBe(false);
  });

  it("matches mentioned JD records by company and role", () => {
    const decision = classifyInterviewMaterialReference("切换到腾讯 AI 产品经理 JD，后面按它问");
    const match = matchInterviewMaterialReference(decision, records);

    expect(match?.record.id).toBe(7);
    expect(match?.confidence).toBe("high");
    expect(match?.matchedBy).toEqual(expect.arrayContaining(["company", "role"]));
  });

  it("matches mentioned resume records by explicit id", () => {
    const decision = classifyInterviewMaterialReference("切换到 #23 这份简历，后面按它来问");
    const match = matchInterviewMaterialReference(decision, records);

    expect(match?.record.id).toBe(23);
    expect(match?.confidence).toBe("high");
    expect(match?.matchedBy).toContain("id");
  });

  it("returns null when a weak mention cannot match a local record", () => {
    const decision = classifyInterviewMaterialReference("另外那份 JD 好像也有点相关");
    const match = matchInterviewMaterialReference(decision, records);

    expect(match).toBeNull();
  });
});
