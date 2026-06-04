import { describe, expect, it } from "vitest";
import { classifyInterviewMaterialReference } from "@/lib/agent/interview-rebind-policy";

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
});
