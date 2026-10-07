import { describe, expect, it } from "vitest";
import { composeStagingJudgeResult, scoreAgentOutput, type QualityScorerName } from "@/lib/agent/llm-scorers";
import { judgeStagingOutput } from "@/lib/agent/staging-judge";
import type { ChatCompletionRequest, ChatResult } from "@/lib/ai/model-gateway";

/**
 * Spec 15 评测样本（run-agent-eval staging/release 模式会跑本文件）。
 * 离线（无 DEEPSEEK_API_KEY 或非 eval 模式）时用注入判官跑 hermetic 断言；
 * 有网关时追加一条真实判官用例，验证 usage 采集与 JSON 契约。
 */

const RESUME_SOURCE = [
  "2020-2023 阿里巴巴 前端工程师：负责淘系页面性能优化，主导构建升级。",
  "教育背景：浙江大学 计算机科学 本科。",
].join("\n");

const FABRICATED_OUTPUT = "建议在简历顶部突出你 2021-2024 在腾讯担任资深产品经理、主导微信支付改版的经历，这样更容易通过筛选。";

function scorerFake(responses: Partial<Record<QualityScorerName, string>>) {
  return async (request: ChatCompletionRequest): Promise<ChatResult> => {
    const systemPrompt = request.systemPrompt || "";
    let name: QualityScorerName;
    if (/fabrication detector/.test(systemPrompt)) name = "hallucination";
    else if (/fact-checking/.test(systemPrompt)) name = "faithfulness";
    else if (/relevance judge/.test(systemPrompt)) name = "relevancy";
    else if (/factual-consistency/.test(systemPrompt)) name = "factuality";
    else throw new Error(`unknown scorer prompt: ${systemPrompt.slice(0, 60)}`);
    return {
      text: responses[name] ?? '{"score": 1, "reason": "ok"}',
      toolCalls: [],
      modelUsed: "fake-judge",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  };
}

const live = Boolean((process.env.DEEPSEEK_API_KEY || "").trim() && (process.env.AGENT_EVAL_MODE || "").trim());

describe("Spec 15 eval: LLM-scored staging judge on the hallucination fixture", () => {
  it("refuses release for the fabricated-experience fixture and allows the faithful one", async () => {
    const fabricated = await scoreAgentOutput(
      { taskType: "resume_edit", output: FABRICATED_OUTPUT, sourceMaterials: [RESUME_SOURCE] },
      { complete: scorerFake({ hallucination: '{"score": 0.05, "fabricated": [{"item": "腾讯资深产品经理", "reason": "源材料只有阿里巴巴前端工程师"}], "reason": "编造工作经历与公司"}' }) },
    );
    const fabricatedComposed = composeStagingJudgeResult(
      judgeStagingOutput({ taskType: "resume_edit", output: FABRICATED_OUTPUT }),
      fabricated,
    );
    expect(fabricatedComposed.hardVetoes).toContain("fabricated_experience");
    expect(fabricatedComposed.releaseAllowed).toBe(false);
    expect(fabricated.usage.totalTokens).toBeGreaterThan(0);

    const faithful = await scoreAgentOutput(
      { taskType: "resume_edit", output: "建议保持阿里巴巴前端经历的量化表述，下一步补充性能优化的具体数字。", sourceMaterials: [RESUME_SOURCE] },
      { complete: scorerFake({}) },
    );
    const faithfulComposed = composeStagingJudgeResult(
      judgeStagingOutput({ taskType: "resume_edit", output: "建议保持阿里巴巴前端经历的量化表述，下一步补充性能优化的具体数字。" }),
      faithful,
    );
    expect(faithfulComposed.hardVetoes).toEqual([]);
    expect(faithfulComposed.releaseAllowed).toBe(true);
  });

  it.skipIf(!live)("runs the real judge through the model gateway and records usage", async () => {
    const quality = await scoreAgentOutput({
      taskType: "resume_edit",
      output: FABRICATED_OUTPUT,
      sourceMaterials: [RESUME_SOURCE],
    });
    expect(quality.scores.hallucination).toBeDefined();
    expect(quality.usage.totalTokens).toBeGreaterThan(0);
  });
});
