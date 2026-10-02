/**
 * 质量评分器（Spec 15）——「质量 Judge」接缝的 LLM 适配器。
 *
 * 家规（2026-10 计划决策 #13/#14）：
 * - 自写最小实现，判官调用统一走 model-gateway（prompt 底稿抄 autoevals，MIT）；
 * - 仅在 eval 样本集运行，不评线上真实流量；
 * - 只产出规范 veto 代码：HARD_VETO_PATTERNS 会静默丢弃自由文本；
 * - token 成本经 ChatResult.usage 累计，运行时打印成本摘要供发版回填。
 */
import { complete, type ChatCompletionRequest, type ChatResult } from "@/lib/ai/model-gateway";
import type { AgentTaskType } from "@/lib/agent/task-contract";
import { hardVetoPasses, type StagingJudgeResult } from "@/lib/agent/staging-judge";

export const LLM_SCORER_VERSION = "llm-scorer-v1";

export const QUALITY_VETO_CODES = ["fabricated_experience", "unsupported_claim"] as const;
export type QualityVetoCode = (typeof QUALITY_VETO_CODES)[number];

export type QualityScorerName = "faithfulness" | "hallucination" | "relevancy" | "factuality";

export interface QualityScorerInput {
  taskType: AgentTaskType;
  output: string;
  /** 判官判定忠实度的事实源：简历 section、JD 原文等。 */
  sourceMaterials: string[];
  expectedFacts?: string[];
  request?: string;
}

export interface QualityScorerResult {
  scorer: QualityScorerName;
  score: number;
  passed: boolean;
  reason: string;
  vetoCode?: QualityVetoCode;
}

export interface QualityScoreResult {
  scorerVersion: string;
  /** 键为 scorer 名，值 0-1；由 composeStagingJudgeResult 并入 dimensions。 */
  scores: Record<string, number>;
  score: number;
  /** true（简历类）：veto 与合并分数都参与发布判定；false（JD 类）：只产生 qualityWarnings。 */
  blocking: boolean;
  hardVetoes: string[];
  qualityWarnings: string[];
  evidence: string[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

type ScorerCompletion = (request: ChatCompletionRequest) => Promise<ChatResult>;

interface ScorerPlan {
  names: QualityScorerName[];
  /** true：评分失败进入 hardVetoes 阻断发布；false：降级为 qualityWarnings。 */
  blocking: boolean;
}

/** 阻断范围固定（Spec 15）：简历类产物阻断，JD 摘要记录级，其余任务类型不接。 */
const SCORER_PLANS: Partial<Record<AgentTaskType, ScorerPlan>> = {
  resume_edit: { names: ["faithfulness", "hallucination"], blocking: true },
  resume_query: { names: ["faithfulness", "hallucination"], blocking: true },
  jd_evaluation: { names: ["relevancy", "factuality"], blocking: false },
};

/** 阻断任务通过阈值（Spec 24 生产软门复用：低于此值降级「仅供参考」）。 */
export const BLOCKING_SCORE_THRESHOLD = 0.8;
const ADVISORY_SCORE_THRESHOLD = 0.75;
const MAX_MATERIAL_CHARS = 4000;

function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

const SCORER_INSTRUCTIONS: Record<QualityScorerName, string> = {
  faithfulness: [
    "You are a strict fact-checking judge for a job-search assistant.",
    "Judge whether every factual claim in the OUTPUT is directly supported by the SOURCE MATERIALS.",
    'Respond with JSON only: {"score": <0-1>, "unsupported": [{"claim": "...", "reason": "..."}], "reason": "<one sentence>"}',
    "Score 1 means every claim is supported; 0 means mostly unsupported.",
  ].join("\n"),
  hallucination: [
    "You are a fabrication detector for a job-search assistant. A candidate's career record must never be invented.",
    "Identify work experiences, skills, companies, schools, certifications, dates or numbers that appear in OUTPUT but NOT in SOURCE MATERIALS.",
    'Respond with JSON only: {"score": <0-1>, "fabricated": [{"item": "...", "reason": "..."}], "reason": "<one sentence>"}',
    "Score 1 means nothing is fabricated; 0 means heavy fabrication.",
  ].join("\n"),
  relevancy: [
    "You are a relevance judge for a job-search assistant.",
    "Judge how well the OUTPUT addresses the REQUEST.",
    'Respond with JSON only: {"score": <0-1>, "missing": ["..."], "reason": "<one sentence>"}',
    "Score 1 means fully on-target; 0 means unrelated.",
  ].join("\n"),
  factuality: [
    "You are a factual-consistency judge for a job-search assistant.",
    "Judge whether factual statements in OUTPUT are consistent with the SOURCE MATERIALS and whether every EXPECTED FACT is covered.",
    'Respond with JSON only: {"score": <0-1>, "missingFacts": ["..."], "contradictions": ["..."], "reason": "<one sentence>"}',
  ].join("\n"),
};

function buildUserMessage(input: QualityScorerInput): string {
  const materials = input.sourceMaterials
    .map((material, index) => `<source-${index + 1}>\n${material.slice(0, MAX_MATERIAL_CHARS)}\n</source-${index + 1}>`)
    .join("\n");
  return [
    input.request ? `REQUEST:\n${input.request.slice(0, MAX_MATERIAL_CHARS)}` : "",
    `SOURCE MATERIALS:\n${materials || "(none provided)"}`,
    input.expectedFacts?.length ? `EXPECTED FACTS:\n- ${input.expectedFacts.join("\n- ")}` : "",
    `OUTPUT:\n${input.output.slice(0, MAX_MATERIAL_CHARS * 2)}`,
  ].filter(Boolean).join("\n\n");
}

function parseScorerJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Quality scorer returned non-JSON output: ${text.slice(0, 200)}`);
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Quality scorer JSON parse failed: ${error instanceof Error ? error.message : error}`);
  }
}

function vetoFor(name: QualityScorerName, parsed: Record<string, unknown>): QualityVetoCode | undefined {
  if (name === "hallucination" && Array.isArray(parsed.fabricated) && parsed.fabricated.length > 0) {
    return "fabricated_experience";
  }
  if (name === "faithfulness" && Array.isArray(parsed.unsupported) && parsed.unsupported.length > 0) {
    return "unsupported_claim";
  }
  return undefined;
}

function passingThreshold(taskType: AgentTaskType): number {
  return SCORER_PLANS[taskType]?.blocking ? BLOCKING_SCORE_THRESHOLD : ADVISORY_SCORE_THRESHOLD;
}

async function runScorer(
  name: QualityScorerName,
  input: QualityScorerInput,
  callLLM: ScorerCompletion,
): Promise<QualityScorerResult> {
  const request: ChatCompletionRequest = {
    messages: [{ role: "user", content: buildUserMessage(input) }],
    systemPrompt: SCORER_INSTRUCTIONS[name],
    temperature: 0,
    maxTokens: 600,
    stream: false,
    timeoutMs: 30_000,
  };
  const result = await callLLM(request);
  const parsed = parseScorerJson(result.text);
  const score = clampScore(parsed.score);
  const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "";
  return {
    scorer: name,
    score,
    passed: score >= passingThreshold(input.taskType),
    reason,
    vetoCode: vetoFor(name, parsed),
  };
}

/** 对一个 eval 样本跑全套评分器；没有评分计划的任务类型返回空结果（evidence=no_scorer_plan）。 */
export async function scoreAgentOutput(
  input: QualityScorerInput,
  options: { complete?: ScorerCompletion } = {},
): Promise<QualityScoreResult> {
  const plan = SCORER_PLANS[input.taskType];
  if (!plan) {
    return {
      scorerVersion: LLM_SCORER_VERSION,
      scores: {},
      score: 1,
      blocking: false,
      hardVetoes: [],
      qualityWarnings: [],
      evidence: ["no_scorer_plan"],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
  const callLLM = options.complete || complete;
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const trackedComplete: ScorerCompletion = async (request) => {
    const result = await callLLM(request);
    if (result.usage) {
      usage.promptTokens += result.usage.promptTokens;
      usage.completionTokens += result.usage.completionTokens;
      usage.totalTokens += result.usage.totalTokens ?? result.usage.promptTokens + result.usage.completionTokens;
    }
    return result;
  };

  const results: QualityScorerResult[] = [];
  for (const name of plan.names) {
    results.push(await runScorer(name, input, trackedComplete));
  }

  const scores = Object.fromEntries(results.map((result) => [result.scorer, result.score]));
  const score = Number((results.reduce((sum, result) => sum + result.score, 0) / results.length).toFixed(3));
  // Outside-voice #2: veto keys off the fabrication/unsupported arrays, not the aggregate
  // score — a judge returning score 0.9 with a populated fabricated[] list is exactly the
  // miss this gate exists to catch.
  const hardVetoes = plan.blocking
    ? results.filter((result) => result.vetoCode).map((result) => result.vetoCode as QualityVetoCode)
    : [];
  const qualityWarnings = plan.blocking
    ? []
    : results.filter((result) => !result.passed).map((result) => `llm_${result.scorer}_below_threshold`);
  const evidence = results.map((result) => `llm_${result.scorer}=${result.score}${result.reason ? `:${result.reason}` : ""}`);

  console.log(`[quality-scorer] ${input.taskType} prompt=${usage.promptTokens} completion=${usage.completionTokens} total=${usage.totalTokens}`);

  return {
    scorerVersion: LLM_SCORER_VERSION,
    scores,
    score,
    blocking: plan.blocking,
    hardVetoes,
    qualityWarnings,
    evidence,
    usage,
  };
}

/** 把评分结果并进 StagingJudgeResult：维度合并、veto 合并后仍过同一过滤器。
 *  Outside-voice #3: blocking 任务取两套评分的较小值——平均会在两个未对齐的量表间
 *  静默把发布门往宽松方向重校准；min 保守且单调。
 *  advisory（非阻断）任务不受合并分数影响：低分只留在 qualityWarnings。 */
export function composeStagingJudgeResult(base: StagingJudgeResult, quality: QualityScoreResult): StagingJudgeResult {
  const hardVetoes = Array.from(new Set([...base.hardVetoes, ...quality.hardVetoes])).filter(hardVetoPasses);
  const score = quality.blocking
    ? Math.min(base.score, quality.score)
    : Number(((base.score + quality.score) / 2).toFixed(3));
  return {
    ...base,
    judgeVersion: `${base.judgeVersion}+${quality.scorerVersion}`,
    dimensions: { ...base.dimensions, ...quality.scores },
    score,
    hardVetoes,
    releaseAllowed: hardVetoes.length === 0
      && (quality.blocking ? score >= base.thresholdProposal.minimumScore : base.releaseAllowed),
    evidence: [...base.evidence, ...quality.evidence],
  };
}
