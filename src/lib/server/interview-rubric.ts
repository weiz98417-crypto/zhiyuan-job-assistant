/**
 * 面试回答评分锚定模块（Spec 26 / ADR-0042）。
 *
 * 评分纪律：0-4 五档锚点、每档判定必须引用回答原文、三态区分
 * （does_not_know / did_not_articulate / not_on_resume）、不换算百分制。
 * 无证据引用的评分产出规范 veto 代码 `missing_evidence_citation` 作废重评一次；
 * 仍无引用 → 记「未评分」，不猜分。分数不直写记忆——趋势入账由 interview-trend 处理。
 * rubric 文本：知识注册表 prompt.interview-answer-scoring（LuJie CareerKit 改编，Apache-2.0）。
 */
import { llmRetry } from "@/lib/llm-retry";
import { parseLlmJsonObject } from "@/lib/llm-json";
import { loadRegistryText } from "@/lib/agent/knowledge/registry/loader";
import { COACH_MODES, type AnswerScore, type CoachMode } from "@/types";

export const INTERVIEW_SCORING_VERSION = "interview-rubric-v1";

export type RubricState = "does_not_know" | "did_not_articulate" | "not_on_resume" | "none";
export type RubricBand = 0 | 1 | 2 | 3 | 4;

export interface RubricScoredAnswer extends AnswerScore {
  scoringVersion: string;
  bands: Record<"structure" | "specificity" | "highlight" | "timing", RubricBand>;
  overallBand: RubricBand;
  /** 每个维度档位判定的回答原文引用（逐字摘抄）。 */
  evidence: Record<string, string>;
  states: Record<string, RubricState>;
  review: {
    effectiveEvidence: string;
    mainGaps: string;
    stateVerdict: string;
    betterStructure: string;
  };
}

export interface UnscoredAnswer {
  unscored: true;
  reason: string;
  scoringVersion: string;
}

export type RubricScoringResult = RubricScoredAnswer | UnscoredAnswer;

/** 规范 veto 代码：HARD_VETO_PATTERNS 必须覆盖（staging-judge.ts 已随 Spec 26 扩展）。 */
export const MISSING_EVIDENCE_VETO = "missing_evidence_citation";

const DIMENSIONS = ["structure", "specificity", "highlight", "timing"] as const;
type Dimension = (typeof DIMENSIONS)[number];

const MODE_WEIGHTS: Record<CoachMode, Record<Dimension, number>> = {
  "project-review": { structure: 0.3, specificity: 0.3, highlight: 0.25, timing: 0.15 },
  behavioral: { structure: 0.3, specificity: 0.3, highlight: 0.25, timing: 0.15 },
  scenario: { structure: 0.25, specificity: 0.25, highlight: 0.3, timing: 0.2 },
  "structured-sme": { structure: 0.3, specificity: 0.35, highlight: 0.2, timing: 0.15 },
  founder: { structure: 0.2, specificity: 0.25, highlight: 0.35, timing: 0.2 },
  stability: { structure: 0.4, specificity: 0.2, highlight: 0.1, timing: 0.3 },
};

export interface RubricScoringInput {
  question: string;
  answer: string;
  mode?: CoachMode;
  context?: string;
  memorySummary?: string;
  signal?: AbortSignal;
}

/** 测试注入点：与 model-gateway complete 同形。 */
export type RubricCompletion = (request: {
  messages: Array<{ role: string; content: string }>;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}) => Promise<{ text: string }>;

/** 0-4 档 → 1-5 线性映射（仅供旧界面显示，不是评分本体）。 */
export function bandToFiveScale(band: RubricBand): number {
  return 1 + band;
}

/** 判定一个评分响应是否每档都带了原文引用；缺档位、非数值档位或短引用都算 missing
 *  （eng review S2-2：「high」这类字符串档位不得静默归 2 档）。 */
export function findMissingEvidence(parsed: {
  bands?: unknown;
  evidence?: unknown;
}): string[] {
  const bands = (parsed.bands && typeof parsed.bands === "object" ? parsed.bands : {}) as Record<string, unknown>;
  const evidence = (parsed.evidence && typeof parsed.evidence === "object" ? parsed.evidence : {}) as Record<string, string>;
  return DIMENSIONS.filter((dimension) => {
    const band = bands[dimension];
    if (typeof band !== "number" || !Number.isFinite(band)) return true; // 缺档或非数值 → veto
    const quote = evidence[dimension];
    return typeof quote !== "string" || quote.trim().length < 2;
  });
}

function normalizeBand(value: unknown): RubricBand {
  const num = Number(value);
  if (!Number.isFinite(num)) return 2;
  return Math.max(0, Math.min(4, Math.round(num))) as RubricBand;
}

function normalizeState(value: unknown): RubricState {
  return value === "does_not_know" || value === "did_not_articulate" || value === "not_on_resume" ? value : "none";
}

function parseRubricJson(text: string): Record<string, unknown> | null {
  return parseLlmJsonObject(text);
}

function buildScored(parsed: Record<string, unknown>, mode: CoachMode): RubricScoredAnswer {
  const bandsRaw = (parsed.bands && typeof parsed.bands === "object" ? parsed.bands : {}) as Record<string, unknown>;
  const evidenceRaw = (parsed.evidence && typeof parsed.evidence === "object" ? parsed.evidence : {}) as Record<string, unknown>;
  const statesRaw = (parsed.states && typeof parsed.states === "object" ? parsed.states : {}) as Record<string, unknown>;
  const reviewRaw = (parsed.review && typeof parsed.review === "object" ? parsed.review : {}) as Record<string, unknown>;
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).filter(Boolean) : [];

  const bands = Object.fromEntries(DIMENSIONS.map((d) => [d, normalizeBand(bandsRaw[d])])) as Record<Dimension, RubricBand>;
  const weights = MODE_WEIGHTS[mode];
  const overallBand = normalizeBand(parsed.overallBand ?? Math.round(DIMENSIONS.reduce((sum, d) => sum + bands[d] * weights[d], 0)));
  const overallFive = bandToFiveScale(overallBand);

  const segmentFeedback = Array.isArray(parsed.segmentFeedback)
    ? parsed.segmentFeedback.flatMap((value) => {
        const item = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
        const text = typeof item.text === "string" ? item.text : "";
        if (!text) return [];
        const rating = item.rating === "good" || item.rating === "compress" ? item.rating : "expand";
        return [{ text, rating }] as Array<{ text: string; rating: "good" | "expand" | "compress" }>;
      })
    : [];

  return {
    scoringVersion: INTERVIEW_SCORING_VERSION,
    bands,
    overallBand,
    evidence: Object.fromEntries(DIMENSIONS.map((d) => [d, typeof evidenceRaw[d] === "string" ? evidenceRaw[d] : ""])),
    states: Object.fromEntries(DIMENSIONS.map((d) => [d, normalizeState(statesRaw[d])])),
    review: {
      effectiveEvidence: typeof reviewRaw.effectiveEvidence === "string" ? reviewRaw.effectiveEvidence : "",
      mainGaps: typeof reviewRaw.mainGaps === "string" ? reviewRaw.mainGaps : "",
      stateVerdict: typeof reviewRaw.stateVerdict === "string" ? reviewRaw.stateVerdict : "",
      betterStructure: typeof reviewRaw.betterStructure === "string" ? reviewRaw.betterStructure : "",
    },
    // 兼容字段：旧 UI 的 1-5 显示
    dimensions: {
      structure: bandToFiveScale(bands.structure),
      specificity: bandToFiveScale(bands.specificity),
      highlight: bandToFiveScale(bands.highlight),
      timing: bandToFiveScale(bands.timing),
    },
    overall: overallFive,
    suggestions: suggestions.length
      ? suggestions
      : reviewRaw.betterStructure
        ? [String(reviewRaw.betterStructure)]
        : [],
    segmentFeedback,
  };
}

async function callRubricOnce(
  input: RubricScoringInput,
  mode: CoachMode,
  completion?: RubricCompletion,
  retryFeedback?: string,
): Promise<Record<string, unknown> | null> {
  const modeInfo = COACH_MODES[mode];
  const weights = MODE_WEIGHTS[mode];
  const systemPrompt = loadRegistryText("prompt.interview-answer-scoring")
    .replace("{{MODE_LABEL}}", modeInfo.label)
    .replace("{{MODE_STRUCTURE}}", modeInfo.structure.join(" → "))
    .replace("{{WEIGHTS}}", `结构 ${weights.structure}、具体 ${weights.specificity}、亮点 ${weights.highlight}、时间 ${weights.timing}`);
  const userContent = [
    `题目：${input.question}`,
    `回答：${input.answer}`,
    input.context ? `上下文：${input.context.slice(0, 1000)}` : "",
    input.memorySummary ? `长期记忆：${input.memorySummary}` : "",
    retryFeedback ? `\n${retryFeedback}` : "",
  ].filter(Boolean).join("\n");

  if (completion) {
    const result = await completion({
      messages: [{ role: "user", content: userContent }],
      systemPrompt,
      temperature: 0.2,
      maxTokens: 4000,
    });
    return parseRubricJson(result.text);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
    model: "deepseek-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    retries: 2,
    fallbackModel: "deepseek-flash",
    signal: input.signal,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return parseRubricJson(payload.choices?.[0]?.message?.content || "{}");
}

/**
 * 锚定评分主入口：评分 → 无引用 veto → 带反馈重评一次 → 仍无引用 = 未评分。
 */
export async function scoreAnswerWithRubric(
  input: RubricScoringInput,
  options: { completion?: RubricCompletion } = {},
): Promise<RubricScoringResult> {
  const mode: CoachMode = input.mode && input.mode in COACH_MODES ? input.mode : "behavioral";

  let parsed = await callRubricOnce(input, mode, options.completion);
  if (!parsed) {
    // 解析失败与缺引用同属可重试暂态（间歇性 ~15%，eng review 校准实测）：重试一次
    parsed = await callRubricOnce(input, mode, options.completion,
      "上一轮返回无法解析为合法 JSON。严格输出单个 JSON 对象：不要 markdown 围栏外的任何文本，字符串值内的双引号必须转义，不要在被截断处停止。");
    if (!parsed) {
      return { unscored: true, reason: "重试后仍无法解析为 JSON", scoringVersion: INTERVIEW_SCORING_VERSION };
    }
  }
  let missing = findMissingEvidence(parsed);
  if (missing.length > 0) {
    // veto 路径：作废重评一次（仅一次）
    parsed = await callRubricOnce(
      input,
      mode,
      options.completion,
      `上一轮评分被判无效（${MISSING_EVIDENCE_VETO}）：以下维度没有引用回答原文——${missing.join("、")}。每个维度的 evidence 字段必须逐字摘抄回答片段，否则本次评分作废。`,
    );
    if (!parsed) {
      return { unscored: true, reason: `重评后仍无法解析（${MISSING_EVIDENCE_VETO}）`, scoringVersion: INTERVIEW_SCORING_VERSION };
    }
    missing = findMissingEvidence(parsed);
    if (missing.length > 0) {
      return { unscored: true, reason: `重评后仍缺证据引用（${MISSING_EVIDENCE_VETO}）：${missing.join("、")}`, scoringVersion: INTERVIEW_SCORING_VERSION };
    }
  }
  return buildScored(parsed, mode);
}
