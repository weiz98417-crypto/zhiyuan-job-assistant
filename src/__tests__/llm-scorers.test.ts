import { describe, expect, it } from "vitest";
import {
  composeStagingJudgeResult,
  scoreAgentOutput,
  type QualityScorerInput,
  type QualityScorerName,
} from "@/lib/agent/llm-scorers";
import { judgeStagingOutput } from "@/lib/agent/staging-judge";
import type { ChatCompletionRequest, ChatResult } from "@/lib/ai/model-gateway";

const CLEAN_RESUME_OUTPUT = "依据原始事实提出修改建议，下一步等待确认，不虚构经历。";
const FABRICATED_RESUME_OUTPUT = "建议突出你曾在字节跳动担任高级产品经理三年的经历，下一步可以直接写入简历。";

function fakeComplete(responses: Partial<Record<QualityScorerName, string>>) {
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

function resumeInput(output: string): QualityScorerInput {
  return {
    taskType: "resume_edit",
    output,
    sourceMaterials: ["2020-2023 阿里巴巴 前端工程师，负责淘系页面性能优化。"],
    expectedFacts: ["修改建议"],
  };
}

describe("Spec 15: LLM quality scorers behind the staging judge", () => {
  it("blocks a fabricated-experience resume output via the canonical veto code", async () => {
    const quality = await scoreAgentOutput(resumeInput(FABRICATED_RESUME_OUTPUT), {
      complete: fakeComplete({
        hallucination: '{"score": 0.1, "fabricated": [{"item": "字节跳动高级产品经理", "reason": "源材料无此经历"}], "reason": "编造工作经历"}',
      }),
    });
    expect(quality.hardVetoes).toContain("fabricated_experience");

    const composed = composeStagingJudgeResult(judgeStagingOutput({ taskType: "resume_edit", output: FABRICATED_RESUME_OUTPUT }), quality);
    expect(composed.hardVetoes).toContain("fabricated_experience");
    expect(composed.releaseAllowed).toBe(false);
  });

  it("blocks unsupported claims through the extended veto filter", async () => {
    const quality = await scoreAgentOutput(resumeInput("你主导过亿元级项目，建议量化写出来。"), {
      complete: fakeComplete({
        faithfulness: '{"score": 0.2, "unsupported": [{"claim": "主导亿元级项目", "reason": "源材料无该项目"}], "reason": "论断无出处"}',
      }),
    });
    expect(quality.hardVetoes).toContain("unsupported_claim");

    const composed = composeStagingJudgeResult(judgeStagingOutput({ taskType: "resume_edit", output: "你主导过亿元级项目。" }), quality);
    expect(composed.releaseAllowed).toBe(false);
  });

  it("lets a faithful resume output pass with merged dimensions and the conservative min score", async () => {
    const base = judgeStagingOutput({ taskType: "resume_edit", output: CLEAN_RESUME_OUTPUT, expectedFacts: ["修改建议"] });
    const quality = await scoreAgentOutput(resumeInput(CLEAN_RESUME_OUTPUT), { complete: fakeComplete({}) });
    const composed = composeStagingJudgeResult(base, quality);

    expect(composed.hardVetoes).toEqual([]);
    expect(composed.releaseAllowed).toBe(true);
    // Outside-voice #3: blocking tasks take min(base, quality) — averaging two
    // uncalibrated scales could silently rescue a failing deterministic score.
    expect(composed.score).toBe(Math.min(base.score, quality.score));
    expect(Object.keys(composed.dimensions)).toContain("faithfulness");
    expect(composed.judgeVersion).toContain("llm-scorer-v1");
  });

  it("downgrades low JD relevancy to quality warnings instead of vetoes", async () => {
    const quality = await scoreAgentOutput(
      { taskType: "jd_evaluation", output: "今天天气不错。", sourceMaterials: ["岗位职责：前端开发，要求 React 经验。"] },
      { complete: fakeComplete({ relevancy: '{"score": 0.1, "missing": ["岗位职责分析"], "reason": "答非所问"}' }) },
    );
    expect(quality.hardVetoes).toEqual([]);
    expect(quality.qualityWarnings).toContain("llm_relevancy_below_threshold");

    const composed = composeStagingJudgeResult(judgeStagingOutput({ taskType: "jd_evaluation", output: "完整且非常有帮助的 JD 分析和下一步建议。" }), quality);
    expect(composed.releaseAllowed).toBe(true);
  });

  it("returns an empty plan result for task types outside the blocking scope", async () => {
    const quality = await scoreAgentOutput({ taskType: "general_chat", output: "你好", sourceMaterials: [] }, { complete: fakeComplete({}) });
    expect(quality.evidence).toContain("no_scorer_plan");
    expect(quality.hardVetoes).toEqual([]);
    expect(quality.usage.totalTokens).toBe(0);
  });

  it("fails loudly when the judge model returns non-JSON output", async () => {
    await expect(scoreAgentOutput(resumeInput(CLEAN_RESUME_OUTPUT), {
      complete: fakeComplete({ hallucination: "抱歉，我无法以 JSON 格式回答。" }),
    })).rejects.toThrow(/JSON parse failed|non-JSON/);
  });

  it("accumulates judge token usage across the scorer suite", async () => {
    const quality = await scoreAgentOutput(resumeInput(CLEAN_RESUME_OUTPUT), { complete: fakeComplete({}) });
    expect(quality.usage.promptTokens).toBe(20);
    expect(quality.usage.completionTokens).toBe(10);
    expect(quality.usage.totalTokens).toBe(30);
  });
});
