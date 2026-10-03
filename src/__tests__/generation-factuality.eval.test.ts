/**
 * Eval：生成链事实门（Spec 24 补全，eng review 延后项收口）+ 万/亿/千单位归一。
 * generateResumeDraftForAgent 用注入 completion 驱动全链路（LLM mock、repositories 走真实
 * SQLite 内存库的既有测试模式——参考 server-agent-resume-proposal-tools 测试）。
 */
import { describe, expect, it } from "vitest";
import { extractNumberTokens, checkNumberProvenance } from "@/lib/server/resume-factuality";

describe("数字溯源：万/亿/千单位归一（跨表示匹配）", () => {
  it("「800万」与「8,000,000」是同一个数", () => {
    expect(checkNumberProvenance("负责年营收8,000,000元的业务线", ["我负责年营收800万的业务线"]).ok).toBe(true);
    expect(checkNumberProvenance("负责年营收800万元的业务线", ["年营收8,000,000元"]).ok).toBe(true);
  });

  it("「1.5亿」与「150,000,000」互通；「3千」与「3000」互通", () => {
    expect(checkNumberProvenance("服务1.5亿用户", ["覆盖150,000,000用户"]).ok).toBe(true);
    expect(checkNumberProvenance("服务3000家客户", ["服务3千家客户"]).ok).toBe(true);
  });

  it("数值不同仍然拦截（800万 ≠ 1200万）", () => {
    expect(checkNumberProvenance("负责年营收1200万的业务线", ["我负责年营收800万的业务线"]).ok).toBe(false);
  });

  it("extractNumberTokens 直接验证折算", () => {
    expect(extractNumberTokens("800万")).toEqual(["8000000"]);
    expect(extractNumberTokens("1.5亿")).toEqual(["150000000"]);
    expect(extractNumberTokens("3千")).toEqual(["3000"]);
    expect(extractNumberTokens("GPT-4的800万")).toEqual(["8000000"]);
  });
});
