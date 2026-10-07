/**
 * Eval：拒信解析（Spec 29）+ 趋势入账门控（Spec 26）确定性部分。
 * 拒信解析用注入 completion 断言封闭集/veto 纪律；趋势门控验证 Postgres 前置与阈值常量。
 */
import { describe, expect, it } from "vitest";
import { parseRejectionNotice, confirmRejectionToLedger } from "@/lib/server/rejection-parsing";
import { TREND_SESSION_THRESHOLD, WEAK_BAND } from "@/lib/server/interview-trend";

function rejectionResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    company: "某科技公司",
    role: "AI产品经理",
    reasonLabel: "resume_mismatch",
    quote: "很遗憾，您的经验背景与我们的岗位要求存在一定差距",
    freeText: "建议补充B端案例",
    ...overrides,
  }, null, 0);
}

describe("Spec 29: 拒信解析（注入 completion）", () => {
  const sampleText = "您好，感谢您应聘我司AI产品经理岗位。经综合评估，很遗憾，您的经验背景与我们的岗位要求存在一定差距，暂时无法进入下一轮。祝求职顺利。";

  it("合法解析：封闭标签 + 原文引用", async () => {
    const result = await parseRejectionNotice(sampleText, {
      completion: async () => ({ text: rejectionResponse() }),
    });
    expect(result.ok).toBe(true);
    expect(result.parse!.reasonLabel).toBe("resume_mismatch");
    expect(result.parse!.quote).toContain("经验背景");
    expect(result.parse!.company).toBe("某科技公司");
  });

  it("引用缺失 → veto 作废（missing_evidence_citation 纪律）", async () => {
    const result = await parseRejectionNotice(sampleText, {
      completion: async () => ({ text: rejectionResponse({ quote: "" }) }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("missing_evidence_citation");
  });

  it("引用过短（<6字）同样作废", async () => {
    const result = await parseRejectionNotice(sampleText, {
      completion: async () => ({ text: rejectionResponse({ quote: "遗憾" }) }),
    });
    expect(result.ok).toBe(false);
  });

  it("标签越出封闭集 → 拒绝", async () => {
    const result = await parseRejectionNotice(sampleText, {
      completion: async () => ({ text: rejectionResponse({ reasonLabel: "公司搬家" }) }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("封闭集");
  });

  it("文本过短直接拒绝（不调 LLM）", async () => {
    const result = await parseRejectionNotice("好的", { completion: async () => ({ text: "{}" }) });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("太短");
  });

  it("确认入账在非 Postgres 模式下显式不可用（候选态语义不受影响）", async () => {
    const result = await confirmRejectionToLedger("user_test", {
      company: "某公司", role: "AI产品", reasonLabel: "salary_mismatch", quote: "薪资无法满足您的期望要求", freeText: "",
    });
    // 本地/测试环境无 Postgres：显式失败而非静默（沿 Spec 14 教训）
    expect(result.ok).toBe(false);
    expect(result.error).toBe("postgres_unavailable");
  });
});

describe("Spec 26: 趋势入账门控常量", () => {
  it("阈值：≥3 场才提炼候选；弱项档位 ≤1", () => {
    expect(TREND_SESSION_THRESHOLD).toBe(3);
    expect(WEAK_BAND).toBe(1);
  });
});
