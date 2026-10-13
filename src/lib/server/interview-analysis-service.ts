import { createHash } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { assembleAgentMemoryContext, type AgentMemoryContext } from "@/lib/agent/memory-context";
import {
  advance,
  classifyInterviewControl,
  createSession as createInterviewSession,
  getPhasePrompt,
  type InterviewPhase,
  type InterviewSession,
} from "@/lib/agent/interview/engine";
import { getDataRepositories } from "@/lib/data-repositories";
import { llmRetry } from "@/lib/llm-retry";
import { loadRegistryText } from "@/lib/agent/knowledge/registry/loader";
import { scoreAnswerWithRubric, type RubricCompletion, type RubricScoredAnswer, type RubricScoringResult } from "@/lib/server/interview-rubric";
import { recordWeaknessEvent, sessionSurrogateFor } from "@/lib/server/interview-trend";
import { composeInterview, familyForRole, type QuestionBankStore } from "@/lib/server/question-bank";
import { getPostgresPool } from "@/lib/postgres";
import { COACH_MODES, type AnswerScore, type CoachMode, type InterviewQuestion } from "@/types";
import type { InterviewRebindAction } from "@/lib/agent/interview-rebind-policy";

/** Spec 26：评分器/题库的测试注入点（与生产默认实现同形）。 */
export interface InterviewServiceOverrides {
  rubricCompletion?: RubricCompletion;
  questionBankStore?: QuestionBankStore;
  bankCompletion?: (request: { messages: Array<{ role: string; content: string }>; systemPrompt: string; temperature?: number; maxTokens?: number }) => Promise<{ text: string }>;
  followUpCompletion?: (request: { messages: Array<{ role: string; content: string }>; systemPrompt: string; temperature?: number; maxTokens?: number }) => Promise<{ text: string }>;
}

let overrides: InterviewServiceOverrides = {};

/** 测试专用：注入评分/题库/追问的 LLM 客户端与题库 store。传 {} 恢复生产默认。 */
export function setInterviewServiceOverridesForTests(next: Partial<InterviewServiceOverrides>): void {
  overrides = { ...overrides, ...next };
}

const SKIPPED_MEMORY_WRITEBACK = {
  status: "skipped" as const,
  readBackVerified: false,
  note: "Spec 26（ADR-0042）：单场分数不再直写记忆；弱项跨 ≥3 场趋势由 interview-trend 提炼候选事实。",
};

export interface GenerateInterviewQuestionsInput {
  jdText?: string;
  cvText?: string;
  company?: string;
  role?: string;
  mode?: CoachMode;
  count?: number;
  categories?: InterviewQuestion["category"][];
  additionalContext?: string;
  /** Spec 27 同场去重：本场已问过的题干（主问题+追问），题库召回时排除。 */
  recentQuestions?: string[];
}

export interface ScoreInterviewAnswerInput {
  question: string;
  answer: string;
  mode?: CoachMode;
  context?: string;
  /** 所属面试会话（durable session id）；独立评分缺省时以答案指纹为会话代理。 */
  sessionId?: number | string;
  /** 岗位族（趋势入账的 topic 粒度：维度×岗位族，Spec 26）；缺省 general。 */
  family?: string;
}

export interface StartInterviewSessionInput {
  company: string;
  role: string;
  difficulty?: string;
  focus?: string;
  requestKey: string;
  conversationId?: number;
  jdText?: string;
  cvText?: string;
}

export interface InterviewSessionTurnInput {
  sessionId?: string;
  answer?: string;
  company?: string;
  role?: string;
  jdId?: number;
  reportNum?: number;
  resumeId?: number;
  jdText?: string;
  cvText?: string;
  requestKey?: string;
  conversationId?: number;
  materialAction?: InterviewRebindAction;
  difficulty?: string;
  focus?: string;
}

export class InterviewSessionNotFoundError extends Error {
  constructor() {
    super("会话不存在或已过期");
    this.name = "InterviewSessionNotFoundError";
  }
}

export class InterviewCheckpointConflictError extends Error {
  constructor() {
    super("本场面试状态已被另一条消息更新，请刷新当前会话后继续");
    this.name = "InterviewCheckpointConflictError";
  }
}

type DurableInterviewSession = InterviewSession & {
  checkpointVersion?: number;
  pendingAnswer?: string;
  pendingFollowupAnswers?: string[];
  legacyRecovery?: { requiresReview: boolean; originalState: Record<string, unknown>; reason: string };
  pendingMaterialChange?: { requiresReview: boolean; action: InterviewRebindAction };
};

const INTERVIEW_CHECKPOINT_FIELDS = [
  "phase", "status", "questionIndex", "questions", "answers", "sourceBinding", "currentQuestion",
  "currentFollowups", "pendingAnswer", "pendingFollowupAnswers", "snapshotId", "legacyRecovery", "pendingMaterialChange",
  "mode", "difficulty", "focus", "focusAreas", "allowFollowUps",
] as const;

type InterviewSessionTurnResult = {
  action?: "followup" | "next" | "done" | "paused" | "resumed" | "cancelled" | "help" | "format" | "material_context";
  sessionId: string;
  phase?: InterviewPhase;
  question?: string;
  questionIndex?: number;
  sourceBinding?: InterviewSession["sourceBinding"];
  previousScore?: number | null;
  previousFeedback?: string;
  summary?: string;
  answers?: Array<{ question: string; answer: string; score?: number; feedback?: string }>;
  readBackVerified: true;
  recovered?: boolean;
  status?: InterviewSession["status"];
  message?: string;
  evidence?: {
    conversationId: number; checkpointVersion: number; questionId?: string; engineSessionId: string;
    turnFingerprint?: string; action: string; status: string; readBackVerified: boolean; requiresReview?: boolean;
  };
};

export async function generateInterviewQuestionsForAgent(
  principal: ExecutionPrincipal,
  input: GenerateInterviewQuestionsInput,
  options: { signal?: AbortSignal } = {},
): Promise<{
  questions: InterviewQuestion[];
  company: string;
  role: string;
  mode: CoachMode;
  memoryContext: AgentMemoryContext;
}> {
  const apiKey = requireApiKey();
  const mode = normalizeMode(input.mode);
  const count = Math.max(1, Math.min(Number(input.count) || 1, 20));
  const company = stringValue(input.company);
  const role = stringValue(input.role);
  const jdText = stringValue(input.jdText);
  const cvText = stringValue(input.cvText);
  const categories = Array.isArray(input.categories)
    ? input.categories.filter((value) => ["behavioral", "technical", "case-study", "culture"].includes(value))
    : [];
  const additionalContext = stringValue(input.additionalContext);
  const memoryContext = await assembleAgentMemoryContext({
    userId: principal.userId,
    task: "interview_coaching",
    agentId: "interview",
    query: `${company} ${role}\n${jdText.slice(0, 900)}\n${cvText.slice(0, 900)}`,
    budgetChars: 1100,
    semanticTopK: 5,
  });
  const modeInfo = COACH_MODES[mode];

  // Spec 27：题库优先（SQL 过滤 → LLM 改写，带出处标签）；不可用/为空回落 LLM 直出
  const family = familyForRole(role || undefined);
  try {
    const composed = await composeInterview({
      family,
      phase: phaseToBankPhase(categories),
      company,
      role,
      jdText,
      cvText,
      memorySummary: memoryContext.llmSummary,
      count,
      recentQuestions: arrayValue(input.recentQuestions).map(String).filter(Boolean),
      // Spec 27 同场去重：本场已问的主问题与进行中追问不重复出题
      signal: options.signal,
    }, {
      store: overrides.questionBankStore,
      completion: overrides.bankCompletion,
    });
    if (composed.questions.length > 0) {
      // Spec 30 / WP5：question_source_followup——题库命中占比埋点（vs 直出题的追问率对比数据源）
      void import("@/lib/server/perception-events").then(({ recordPerceptionEvent }) =>
        recordPerceptionEvent(principal.userId, "question_source_followup", {
          bankCount: composed.questions.filter((q) => q.source === "bank").length,
          total: composed.questions.length,
        }),
      ).catch(() => undefined);
      const bankQuestions = composed.questions.map((item) => normalizeComposedQuestion(item, phaseToBankPhase(categories)));
      return { questions: bankQuestions, company, role, mode, memoryContext };
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    // 题库链路失败回落 LLM 直出（回落事件记 console 日志；uiPayload 级标注随工具卡迭代）
    console.log(`[question-bank] fallback to direct LLM: ${error instanceof Error ? error.message : error}`);
  }

  const systemPrompt = loadRegistryText("prompt.interview-question-generation")
    .replace("{{MODE_LABEL}}", modeInfo.label)
    .replace("{{MODE_STRUCTURE}}", modeInfo.structure.join(" → "))
    .replace("{{COUNT}}", String(count))
    .replace("{{CATEGORY_RULE}}", categories.length ? `题目类别只使用：${categories.join("、")}。` : "题目均匀覆盖 behavioral、technical、case-study、culture。")
    .replace("{{BANK_SECTION}}", "题库暂无命中（可出通用题）。");
  const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
    model: "deepseek-flash",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          company ? `公司：${company}` : "",
          role ? `岗位：${role}` : "",
          jdText ? `JD：${jdText.slice(0, 2000)}` : "",
          cvText ? `简历：${cvText.slice(0, 1500)}` : "",
          additionalContext ? `补充上下文：${additionalContext.slice(0, 2500)}` : "",
          memoryContext.llmSummary ? `长期记忆：${memoryContext.llmSummary}` : "",
        ].filter(Boolean).join("\n\n"),
      },
    ],
    temperature: 0.7,
    max_tokens: 1800,
    response_format: { type: "json_object" },
    retries: 2,
    fallbackModel: "deepseek-flash",
    signal: options.signal,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = parseJsonObject(payload.choices?.[0]?.message?.content || "{}");
  const questions = arrayValue(parsed.questions).slice(0, count).flatMap(normalizeQuestion);
  if (questions.length === 0) throw new Error("AI 未能生成有效面试题");
  return { questions, company, role, mode, memoryContext };
}

/** ComposedQuestion → InterviewQuestion（工具卡兼容形状）；category 按请求阶段映射，source/provenance 保真透传。 */
function normalizeComposedQuestion(item: { question: string; source: string; provenance: string }, phaseHint?: string): InterviewQuestion {
  const category = phaseHint === "tech" || phaseHint === "reverse"
    ? phaseHint === "tech" ? "technical" : "culture"
    : "behavioral";
  return {
    category,
    question: item.question,
    context: `出处：${item.provenance}`,
    storyHint: "",
    source: ["jd", "bank", "weakness", "general"].includes(item.source) ? item.source as InterviewQuestion["source"] : "general",
    provenance: item.provenance,
  };
}

/** 面试阶段 → 题库 phase 列取值。 */
function phaseToBankPhase(categories: InterviewQuestion["category"][]): string | undefined {
  if (categories.includes("technical")) return "tech";
  if (categories.includes("behavioral")) return "behavioral";
  if (categories.includes("culture")) return "reverse";
  if (categories.includes("case-study")) return "tech";
  return undefined;
}

/** 追问内容缺口判定（Spec 27）：LLM 判断回答是否遗漏关键数字/结论/依据；
 *  无缺口 → 直接评分；LLM 不可用时回落长度规则（<50 字追问）。 */
export async function decideFollowUp(
  answer: string,
  question: string,
  options: { completion?: InterviewServiceOverrides["followUpCompletion"]; signal?: AbortSignal } = {},
): Promise<{ followUp: boolean; gap?: string; usedFallback: boolean }> {
  const trimmed = answer.trim();
  if (trimmed.length < 20) return { followUp: true, gap: "回答过短", usedFallback: true };
  const systemPrompt = [
    "你是面试官，判断候选人的回答是否遗漏了这道题的关键要素。",
    "关键要素指：具体行为、量化结果、判断依据、结论。已完整覆盖则不需要追问。",
    '严格返回 JSON：{"needsFollowUp": true|false, "gap": "缺失要素的一句话说明，无缺失则留空"}',
  ].join("\n");
  const userContent = `题目：${question}\n回答：${trimmed.slice(0, 2000)}`;
  try {
    let text: string;
    if (options.completion) {
      text = (await options.completion({ messages: [{ role: "user", content: userContent }], systemPrompt, temperature: 0.1, maxTokens: 300 })).text;
    } else {
      const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (!apiKey) return { followUp: trimmed.length < 50, usedFallback: true };
      const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
        model: "deepseek-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: "json_object" },
        retries: 1,
        fallbackModel: "deepseek-flash",
        signal: options.signal,
      });
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      text = payload.choices?.[0]?.message?.content || "{}";
    }
    const parsed = parseJsonObject(text);
    const needs = parsed.needsFollowUp === true;
    return { followUp: needs, gap: stringValue(parsed.gap) || undefined, usedFallback: false };
  } catch {
    // LLM 不可用：长度规则兜底（Spec 27 语义）
    return { followUp: trimmed.length < 50, usedFallback: true };
  }
}

export async function scoreInterviewAnswerForAgent(
  principal: ExecutionPrincipal,
  input: ScoreInterviewAnswerInput,
  options: { signal?: AbortSignal; deferTrendWriteback?: boolean } = {},
): Promise<{
  score: AnswerScore;
  memoryContext: AgentMemoryContext;
  memoryWriteback: { status: "persisted" | "skipped" | "failed"; readBackVerified: boolean; id?: number; error?: string; note?: string };
}> {
  const question = stringValue(input.question);
  const answer = stringValue(input.answer);
  if (!question || !answer) throw new Error("请提供题目 question 和回答 answer");
  const mode = normalizeMode(input.mode);
  const memoryContext = await assembleAgentMemoryContext({
    userId: principal.userId,
    task: "interview_coaching",
    agentId: "interview",
    query: `${question}\n${answer}\n${stringValue(input.context)}`,
    budgetChars: 800,
    semanticTopK: 4,
  });

  // Spec 26（ADR-0042）：锚定 rubric 评分——0-4 档 + 证据引用 + 三态；
  // 无引用 veto 重评一次，仍缺引用 = 未评分（不猜分、不入账）。
  const rubricResult = await scoreAnswerWithRubric({
    question,
    answer,
    mode,
    context: stringValue(input.context),
    memorySummary: memoryContext.llmSummary,
    signal: options.signal,
  }, overrides.rubricCompletion ? { completion: overrides.rubricCompletion } : {});

  let score: AnswerScore;
  if ("unscored" in rubricResult) {
    // 工程原因内部留痕即可，用户看到的是可行动的话术（CEO 审查：文案外泄=事故）
    console.warn(`[interview-score] unscored: ${(rubricResult as { reason: string }).reason}`);
    const observations = buildUnscoredObservations(answer);
    observations.push("这一题的评分没跑出来，但不影响继续——下一题正常作答即可");
    score = {
      dimensions: { structure: 0, specificity: 0, highlight: 0, timing: 0 },
      overall: 0,
      suggestions: observations,
      segmentFeedback: [],
    };
  } else {
    score = rubricToAnswerScore(rubricResult, mode);
    // 弱项趋势：档位 ≤1 的维度记录事件（topic=岗位族，维度×岗位族粒度）；
    // 跨 ≥3 场提炼候选事实（单场不入账本）。surrogate 前缀区分真实会话（sess:）与
    // 独立评分指纹（fp:）——ADR-0042 的「≥3 场」只数真实会话（eng review S1-5）。
    if (!options.deferTrendWriteback) {
      const sessionSurrogate = sessionSurrogateFor(input.sessionId === undefined ? "" : String(input.sessionId), question, answer);
      await persistInterviewWeaknessEvents(principal, rubricResult.bands, sessionSurrogate, stringValue(input.family) || "general");
    }
  }

  return { score, memoryContext, memoryWriteback: { ...SKIPPED_MEMORY_WRITEBACK } };
}

/** Spec 30 / WP6：未评分兜底观察（纯规则，不算评分不入趋势）——把「没打分」变成可行动反馈。 */
export function buildUnscoredObservations(answer: string): string[] {
  const text = answer.trim();
  const observations: string[] = [];
  if (text.length < 50) observations.push("回答偏短——试着按「背景 → 你的动作 → 量化结果」展开到一分钟以上");
  if (!/\d/.test(text)) observations.push("回答里没有任何数字结果——一个具体的数字（百分比/规模/时长）比形容词有说服力");
  const sentences = text.split(/[。！？!?]/).filter((s) => s.trim().length > 0).length;
  if (sentences <= 1 && text.length >= 50) observations.push("整段只有一句话——把动作和结果拆开讲");
  return observations.slice(0, 1); // 至多 1 条可行动观察；鼓励句由调用方固定追加
}

/** RubricScoredAnswer → 旧 AnswerScore 形状（UI/工具兼容）；bands/evidence/states 附加字段透传。 */function rubricToAnswerScore(rubric: RubricScoredAnswer, _mode: CoachMode): AnswerScore & Partial<RubricScoredAnswer> {
  return {
    dimensions: rubric.dimensions,
    overall: rubric.overall,
    suggestions: rubric.suggestions,
    segmentFeedback: rubric.segmentFeedback,
    bands: rubric.bands,
    overallBand: rubric.overallBand,
    evidence: rubric.evidence,
    states: rubric.states,
    review: rubric.review,
    scoringVersion: rubric.scoringVersion,
  };
}

export async function handleInterviewSessionTurnForAgent(
  principal: ExecutionPrincipal,
  input: InterviewSessionTurnInput,
  options: { signal?: AbortSignal } = {},
): Promise<InterviewSessionTurnResult> {
  options.signal?.throwIfAborted();
  const repositories = getDataRepositories();
  const requestedSessionId = stringValue(input.sessionId);
  if (!requestedSessionId) {
    const targetConversation = input.conversationId !== undefined
      ? await repositories.sessions.get(input.conversationId, principal.userId)
      : undefined;
    if (input.conversationId !== undefined && !targetConversation) throw new InterviewSessionNotFoundError();
    const previousAgentState = parseJsonUnknownObject(targetConversation?.agent_state_json);
    const existingSession = parseInterviewSession(targetConversation?.interview_state_json);
    if (existingSession) {
      if (stringValue(previousAgentState.requestKey) === stringValue(input.requestKey)) {
        await verifyInterviewCheckpoint(principal, input.conversationId!, existingSession.checkpointVersion || 0, existingSession);
        return {
          sessionId: String(input.conversationId), phase: existingSession.phase,
          question: existingSession.currentFollowups.at(-1) || existingSession.currentQuestion?.text,
          questionIndex: existingSession.questionIndex, sourceBinding: existingSession.sourceBinding,
          readBackVerified: true, recovered: true,
          evidence: interviewStateEvidence(input.conversationId!, existingSession, "started"),
        };
      }
      throw new Error("当前会话已有面试记录，请继续当前面试或新建会话");
    }
    const sourceSnapshot = parseJsonUnknownObject(parseJsonUnknownObject(targetConversation?.interview_state_json).planSnapshot);
    const preparedJd = parseJsonUnknownObject(sourceSnapshot.jdSnapshot);
    const company = stringValue(preparedJd.company) || stringValue(input.company);
    const role = stringValue(preparedJd.role) || stringValue(input.role);
    if (!company || !role) throw new Error("请提供公司和岗位");
    const memory = await assembleAgentMemoryContext({
      userId: principal.userId,
      task: "interview_coaching",
      agentId: "interview",
      query: `${company} ${role}\n${stringValue(input.jdText)}\n${stringValue(input.cvText)}`,
      budgetChars: 1400,
      semanticTopK: 5,
    });
    const session = createInterviewSession(company, role, {
      jdId: numericValue(input.jdId),
      reportNum: numericValue(input.reportNum),
      resumeId: numericValue(input.resumeId),
      jdText: stringValue(input.jdText).slice(0, 4000) || undefined,
      cvText: stringValue(input.cvText).slice(0, 4000) || undefined,
      memoryContext: memory.llmSummary,
    }) as DurableInterviewSession;
    session.difficulty = ["normal", "hard", "pressure", "junior", "mid", "senior", "staff"].includes(stringValue(input.difficulty))
      ? input.difficulty as InterviewSession["difficulty"] : "mid";
    session.focus = stringValue(input.focus) || "all";
    session.focusAreas = session.focus === "all" ? [] : [session.focus];
    session.allowFollowUps = true;
    if (sourceSnapshot.snapshotId) {
      session.snapshotId = stringValue(sourceSnapshot.snapshotId);
      session.createdAt = stringValue(sourceSnapshot.createdAt) || session.createdAt;
      session.mode = stringValue(sourceSnapshot.mode);
      session.difficulty = ["normal", "hard", "pressure"].includes(stringValue(sourceSnapshot.difficulty))
        ? sourceSnapshot.difficulty as InterviewSession["difficulty"] : "normal";
      session.focusAreas = arrayValue(sourceSnapshot.focusAreas).map(String);
      session.allowFollowUps = sourceSnapshot.allowFollowUps !== false;
      const sourceResume = parseJsonUnknownObject(sourceSnapshot.resumeSnapshot);
      const sourceJD = parseJsonUnknownObject(sourceSnapshot.jdSnapshot);
      const sourceIds = parseJsonUnknownObject(sourceSnapshot.source);
      session.sourceBinding!.jdId = numericValue(sourceIds.jdId) || session.sourceBinding?.jdId;
      session.sourceBinding!.resumeTitle = stringValue(sourceResume.title);
      session.sourceBinding!.resumeId = stringValue(sourceIds.resumeId) || session.sourceBinding?.resumeId;
      session.sourceBinding!.jdText = stringValue(sourceJD.body) || session.sourceBinding?.jdText;
      session.sourceBinding!.cvText = stringValue(sourceResume.body) || session.sourceBinding?.cvText;
    }
    const question = await generateSessionQuestion(principal, session, options.signal);
    session.currentQuestion = {
      id: createQuestionId(session),
      phase: session.phase,
      text: question,
      type: questionTypeForPhase(session.phase),
      createdAt: session.createdAt,
    };
    session.questions.push(session.currentQuestion);
    session.checkpointVersion = 1;
    const sessionFields = {
      title: `${company} ${role} 模拟面试`,
      interviewState: session,
      agentState: {
        ...previousAgentState,
        durableInterview: true,
        requestKey: stringValue(input.requestKey) || undefined,
        checkpointVersion: session.checkpointVersion,
        checkpointStateHash: interviewCheckpointHash(session),
      },
      memoryDigest: memory.llmSummary.slice(0, 300),
    };
    let sessionId: number;
    if (targetConversation && input.conversationId !== undefined) {
      sessionId = input.conversationId;
      const updated = await repositories.sessions.update(sessionId, principal.userId, {
        ...sessionFields,
        expectedInterviewCheckpointVersion: 0,
      });
      if (!updated) throw new InterviewCheckpointConflictError();
    } else {
      sessionId = await repositories.sessions.create({ ...sessionFields, messages: [] }, principal.userId);
    }
    await verifyInterviewCheckpoint(principal, sessionId, session.checkpointVersion, session);
    return {
      sessionId: String(sessionId),
      phase: session.phase,
      question,
      questionIndex: session.questionIndex,
      sourceBinding: session.sourceBinding,
      readBackVerified: true,
      evidence: interviewStateEvidence(sessionId, session, "started"),
    };
  }

  const sessionId = Number(requestedSessionId);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) throw new InterviewSessionNotFoundError();
  const row = await repositories.sessions.get(sessionId, principal.userId);
  if (!row) throw new InterviewSessionNotFoundError();
  const session = parseInterviewSession(row.interview_state_json);
  if (!session) throw new InterviewSessionNotFoundError();
  const answer = stringValue(input.answer);
  if (!answer) throw new Error("请提供面试回答");
  const agentState = parseJsonUnknownObject(row.agent_state_json);
  const turnFingerprint = createHash("sha256")
    .update(stringValue(input.requestKey)
      ? `${sessionId}\u0000request\u0000${stringValue(input.requestKey)}`
      : `${sessionId}\u0000${session.currentQuestion?.id || ""}\u0000${answer}`)
    .digest("hex");
  if (stringValue(agentState.lastTurnFingerprint) === turnFingerprint) {
    const cached = parseJsonUnknownObject(agentState.lastTurnResult) as InterviewSessionTurnResult;
    if (stringValue(cached.sessionId) === String(sessionId)) {
      await verifyInterviewCheckpoint(principal, sessionId, session.checkpointVersion || 0, session);
      return { ...cached, readBackVerified: true, recovered: true };
    }
  }

  const control = classifyInterviewControl(answer);
  if (input.materialAction && input.materialAction !== "continue_current_session") {
    const supporting = input.materialAction === "use_as_supporting_context" || input.materialAction === "keep_current_binding";
    if (!supporting) {
      session.status = "paused";
      session.pendingMaterialChange = { action: input.materialAction, requiresReview: true };
    }
    const message = supporting
      ? `已收到补充材料指令。正式绑定仍为 ${session.company} ${session.role}，这条材料指令不会计入回答。请继续回答当前题：${session.currentFollowups.at(-1) || session.currentQuestion?.text || ""}`
      : "材料切换请求已保留，本场面试已暂停。切换需要单独确认目标材料和新场边界，当前 JD、简历、已回答题目和评分保持原绑定。";
    const result: InterviewSessionTurnResult = {
      sessionId: String(sessionId), action: supporting ? "material_context" : "paused",
      status: session.status, phase: session.phase, question: session.currentFollowups.at(-1) || session.currentQuestion?.text,
      sourceBinding: session.sourceBinding, message, readBackVerified: true,
    };
    await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result);
    return result;
  }
  if (session.legacyRecovery?.requiresReview || session.pendingMaterialChange?.requiresReview) {
    const message = session.legacyRecovery?.requiresReview
      ? "本场历史面试记录需要复核，已暂停自动出题与评分。原题、材料和历史记录已隔离保留；复核完成前不会把这条消息当作面试答案。"
      : "本场材料切换需要单独确认目标材料和新场边界，面试保持暂停。当前消息不会计入回答或评分，原材料绑定保持不变。";
    const result: InterviewSessionTurnResult = {
      sessionId: String(sessionId), action: "paused", status: "paused", phase: session.phase,
      question: session.currentQuestion?.text, sourceBinding: session.sourceBinding, message, readBackVerified: true,
    };
    await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result);
    return result;
  }
  if (control && control !== "skip") {
    let action: InterviewSessionTurnResult["action"];
    let message: string;
    if (session.phase === "done" || session.status === "completed" || session.status === "abandoned") {
      action = session.status === "abandoned" ? "cancelled" : "done";
      message = "本场面试已经结束，已保存的回答保持不变。开始新的面试请新建会话。";
    } else if (control === "pause") {
      session.status = "paused";
      action = "paused";
      message = "面试已暂停，当前题目和已记录的回答已保存。发送“继续面试”即可恢复。";
    } else if (control === "resume") {
      session.status = "active";
      action = "resumed";
      message = `继续当前题目：${session.currentFollowups.at(-1) || session.currentQuestion?.text || "当前暂无题目"}`;
    } else if (control === "finish" || control === "cancel") {
      if (session.pendingAnswer) {
        session.answers.push({
          questionId: session.currentQuestion?.id || "", question: session.currentQuestion?.text || "",
          answer: completePendingInterviewAnswer(session), primaryAnswer: session.pendingAnswer,
          answerTurnId: `turn_user_${session.currentQuestion?.id || ""}`, createdAt: new Date().toISOString(),
          followups: session.currentFollowups.map((question, index) => ({ question, answer: session.pendingFollowupAnswers?.[index] || "" })),
        });
        session.pendingAnswer = undefined;
        session.pendingFollowupAnswers = [];
      }
      session.phase = "done";
      session.status = control === "cancel" ? "abandoned" : "completed";
      action = control === "cancel" ? "cancelled" : "done";
      message = control === "cancel" ? "面试已取消，已记录的回答保留，不生成新的评分或复盘。" : buildInterviewSummary(session);
    } else {
      action = control;
      message = control === "format"
        ? `后续只问一道问题，当前题目仍然是：${session.currentFollowups.at(-1) || session.currentQuestion?.text || "当前暂无题目"}`
        : `当前题目：${session.currentFollowups.at(-1) || session.currentQuestion?.text || "当前暂无题目"}\n可以按“背景 → 你的职责和行动 → 真实结果”回答，缺少数字时直接说明，不要编造经历。`;
    }
    const result: InterviewSessionTurnResult = {
      action, sessionId: String(sessionId), phase: session.phase, status: session.status,
      question: session.currentFollowups.at(-1) || session.currentQuestion?.text,
      questionIndex: session.questionIndex, sourceBinding: session.sourceBinding, message,
      ...(action === "done" ? { summary: message, answers: session.answers } : {}),
      readBackVerified: true,
    };
    await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result);
    return result;
  }
  if (session.phase === "done" || session.status === "completed" || session.status === "abandoned") {
    throw new Error("本场面试已经结束，请新建面试会话");
  }
  if (session.status === "paused") throw new Error("面试已暂停，请先发送“继续面试”恢复当前题目");

  // Spec 27：追问判定从纯长度规则升级为内容缺口判定（LLM 不可用时长度规则兜底）。
  // 硬上限（eng review S1-4）：每主问题 ≤2 次追问，reverse 阶段不追问——防无限横链。
  const followUpAllowed = control !== "skip" && session.allowFollowUps !== false && session.phase !== "reverse" && session.currentFollowups.length < 2;
  if (control !== "skip") {
    if (!session.pendingAnswer) session.pendingAnswer = answer;
    else session.pendingFollowupAnswers = [...(session.pendingFollowupAnswers || []), answer];
  }
  const gapDecision = followUpAllowed
    ? await decideFollowUp(answer, session.currentFollowups.at(-1) || session.currentQuestion?.text || "", {
      completion: overrides.followUpCompletion,
      signal: options.signal,
    })
    : { followUp: false, gap: undefined, usedFallback: false };
  if (gapDecision.followUp && followUpAllowed) {
    const question = await generateFollowUpQuestion(principal, session, answer, gapDecision.gap, options.signal);
    session.currentFollowups.push(question);
    const result: InterviewSessionTurnResult = {
      action: "followup",
      sessionId: String(sessionId),
      phase: session.phase,
      question,
      questionIndex: session.questionIndex,
      sourceBinding: session.sourceBinding,
      readBackVerified: true,
    };
    await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result);
    return result;
  }

  const completeAnswer = completePendingInterviewAnswer(session);
  const scored = control === "skip"
    ? { score: null, feedback: "本题已跳过，跳过指令不计入回答或评分。" }
    : await scoreSessionAnswer(principal, session, completeAnswer, options.signal, sessionId);
  if (completeAnswer) session.answers.push({
    questionId: session.currentQuestion?.id || "",
    question: session.currentQuestion?.text || "",
    answer: completeAnswer,
    primaryAnswer: session.pendingAnswer,
    answerTurnId: `turn_user_${session.currentQuestion?.id || ""}`,
    createdAt: new Date().toISOString(),
    score: scored.score ?? undefined,
    feedback: scored.feedback,
    ...(scored.rubric ? { rubric: scored.rubric } : {}),
    followups: session.currentFollowups.map((question, index) => ({ question, answer: session.pendingFollowupAnswers?.[index] || "" })),
  });
  session.pendingAnswer = undefined;
  session.pendingFollowupAnswers = [];
  const advancedSession = advance(session);

  if (advancedSession.phase === "done") {
    const summary = buildInterviewSummary(session);
    const result: InterviewSessionTurnResult = {
      action: "done",
      sessionId: String(sessionId),
      phase: session.phase,
      summary,
      sourceBinding: session.sourceBinding,
      answers: session.answers.map((item) => ({
        question: item.question,
        answer: item.answer,
        score: item.score,
        feedback: item.feedback,
      })),
      previousScore: scored.score,
      previousFeedback: scored.feedback,
      readBackVerified: true,
    };
    await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result);
    if (control !== "skip") await persistVerifiedInterviewWeakness(principal, sessionId, session);
    try {
      const { recordStoryCandidates } = await import("@/lib/server/interview-story-bank");
      await recordStoryCandidates(principal, session.answers.map((item) => ({
        question: item.question, answer: item.answer,
        scoreBand: Math.max(0, Math.round((item.score || 0) / 2) - 1), topic: item.question.slice(0, 120),
      })));
    } catch (error) { console.warn("[interview-story] 故事册沉淀失败（不阻塞复盘）:", error instanceof Error ? error.message : error); }
    return result;
  }

  const question = await generateSessionQuestion(principal, session, options.signal);
  session.currentQuestion = {
    id: createQuestionId(session),
    phase: session.phase,
    text: question,
    type: questionTypeForPhase(session.phase),
    createdAt: new Date().toISOString(),
  };
  session.questions.push(session.currentQuestion);
  const result: InterviewSessionTurnResult = {
    action: "next",
    sessionId: String(sessionId),
    phase: session.phase,
    question,
    questionIndex: session.questionIndex,
    previousScore: scored.score,
    previousFeedback: scored.feedback,
    sourceBinding: session.sourceBinding,
    readBackVerified: true,
  };
  await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result);
  if (control !== "skip") await persistVerifiedInterviewWeakness(principal, sessionId, session);
  return result;
}

export async function startInterviewSessionForAgent(
  principal: ExecutionPrincipal,
  input: StartInterviewSessionInput,
  options: { signal?: AbortSignal } = {},
): Promise<{ sessionId: string; phase: InterviewPhase; question: string; readBackVerified: true }> {
  const company = stringValue(input.company);
  const role = stringValue(input.role);
  if (!company || !role) throw new Error("请提供公司和岗位");
  const repositories = getDataRepositories();
  const existing = (await repositories.sessions.list(principal.userId)).find((row) => {
    const agentState = parseJsonUnknownObject(row.agent_state_json);
    return stringValue(agentState.requestKey) === input.requestKey
      && (input.conversationId === undefined || Number(row.id) === input.conversationId);
  });
  if (existing) {
    const persisted = await repositories.sessions.get(Number(existing.id), principal.userId);
    const interviewState = parseInterviewSession(persisted?.interview_state_json);
    if (interviewState?.checkpointVersion) {
      await verifyInterviewCheckpoint(principal, Number(existing.id), interviewState.checkpointVersion, interviewState);
      return {
        sessionId: String(existing.id), phase: interviewState.phase,
        question: interviewState.currentFollowups.at(-1) || interviewState.currentQuestion?.text || "", readBackVerified: true,
      };
    }
  }

  const result = await handleInterviewSessionTurnForAgent(principal, {
    company, role, requestKey: input.requestKey, conversationId: input.conversationId,
    jdText: input.jdText, cvText: input.cvText,
    difficulty: input.difficulty, focus: input.focus,
  }, options);
  return { sessionId: result.sessionId, phase: result.phase || "intro", question: result.question || "", readBackVerified: true };
}

export async function continueDurableInterviewForAgent(
  principal: ExecutionPrincipal,
  input: { conversationId: number; content: string; requestKey: string; materialAction?: InterviewRebindAction },
  options: { signal?: AbortSignal } = {},
): Promise<InterviewSessionTurnResult | undefined> {
  const row = await getDataRepositories().sessions.get(input.conversationId, principal.userId);
  if (!row) return undefined;
  if (parseInterviewSession(row.interview_state_json)) {
    return handleInterviewSessionTurnForAgent(principal, {
      sessionId: String(input.conversationId), answer: input.content, requestKey: input.requestKey,
      materialAction: input.materialAction,
    }, options);
  }
  const state = parseJsonUnknownObject(row.interview_state_json);
  const snapshot = parseJsonUnknownObject(state.planSnapshot);
  const jd = parseJsonUnknownObject(snapshot.jdSnapshot);
  const resume = parseJsonUnknownObject(snapshot.resumeSnapshot);
  if (!snapshot.snapshotId) return undefined;
  if (arrayValue(state.questionGraph).length || arrayValue(state.transcript).length) {
    const session = createInterviewSession(stringValue(jd.company) || "目标公司", stringValue(jd.role) || "目标岗位", {
      jdId: numericValue(parseJsonUnknownObject(snapshot.source).jdId), jdText: stringValue(jd.body), cvText: stringValue(resume.body),
      resumeTitle: stringValue(resume.title), resumeId: stringValue(parseJsonUnknownObject(snapshot.source).resumeId),
    }) as DurableInterviewSession;
    session.status = "paused";
    session.snapshotId = stringValue(snapshot.snapshotId);
    session.legacyRecovery = {
      requiresReview: true, originalState: state,
      reason: "Legacy questionGraph was inferred from messages and cannot establish verified question/answer provenance.",
    };
    const current = arrayValue(state.questionGraph).map(objectValue).find((question) => question.id === state.currentQuestionId);
    if (current?.question) {
      session.currentQuestion = { id: stringValue(current.id), phase: "intro", text: stringValue(current.question), type: "tech" };
      session.questions = [session.currentQuestion];
    }
    const result: InterviewSessionTurnResult = {
      action: "paused", sessionId: String(input.conversationId), status: "paused", phase: session.phase,
      question: session.currentQuestion?.text, sourceBinding: session.sourceBinding,
      message: "本场历史面试记录需要复核，已暂停自动出题与评分。原题、材料和历史记录已隔离保留，未迁移为新的评分事实。",
      readBackVerified: true,
    };
    const fingerprint = createHash("sha256").update(input.requestKey).digest("hex");
    await persistInterviewCheckpoint(principal, input.conversationId, session, parseJsonUnknownObject(row.agent_state_json), fingerprint, result);
    return result;
  }
  const result = await handleInterviewSessionTurnForAgent(principal, {
    conversationId: input.conversationId, company: stringValue(jd.company) || "目标公司",
    role: stringValue(jd.role) || "目标岗位", jdText: stringValue(jd.body), cvText: stringValue(resume.body),
    jdId: numericValue(parseJsonUnknownObject(snapshot.source).jdId), requestKey: input.requestKey,
  }, options);
  return result;
}

async function generateSessionQuestion(
  principal: ExecutionPrincipal,
  session: DurableInterviewSession,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const generated = await generateInterviewQuestionsForAgent(principal, {
      company: session.company,
      role: session.role,
      jdText: session.sourceBinding?.jdText,
      cvText: session.sourceBinding?.cvText,
      count: 1,
      categories: categoriesForPhase(session.phase),
      recentQuestions: [
        ...session.answers.map((item) => item.question),
        ...session.currentFollowups,
      ],
      additionalContext: [
        getPhasePrompt(session),
        session.sourceBinding?.memoryContext ? `长期记忆：${session.sourceBinding.memoryContext}` : "",
        session.answers.slice(-3).map((item) => `Q: ${item.question}\nA: ${item.answer}\n评分: ${item.score ?? "未评分"}`).join("\n\n"),
      ].filter(Boolean).join("\n\n"),
    }, { signal });
    return generated.questions[0]?.question || fallbackSessionQuestion(session.phase);
  } catch (error) {
    if (signal?.aborted) throw error;
    return fallbackSessionQuestion(session.phase);
  }
}

function completePendingInterviewAnswer(session: DurableInterviewSession): string {
  return [
    session.pendingAnswer || "",
    ...(session.pendingFollowupAnswers || []).map((followupAnswer, index) => `追问：${session.currentFollowups[index] || ""}\n回答：${followupAnswer}`),
  ].filter(Boolean).join("\n\n");
}

async function generateFollowUpQuestion(
  principal: ExecutionPrincipal,
  session: DurableInterviewSession,
  answer: string,
  gap?: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const generated = await generateInterviewQuestionsForAgent(principal, {
      company: session.company,
      role: session.role,
      jdText: session.sourceBinding?.jdText,
      cvText: session.sourceBinding?.cvText,
      count: 1,
      categories: categoriesForPhase(session.phase),
      additionalContext: `原题：${session.currentQuestion?.text || ""}\n候选人回答：${answer}${gap ? `\n内容缺口：${gap}` : ""}\n只提出一个针对该缺口补充事实、数字或结果的追问。`,
    }, { signal });
    return generated.questions[0]?.question || "能否结合一个具体项目，把你的行动和结果再展开一下？";
  } catch (error) {
    if (signal?.aborted) throw error;
    return "能否结合一个具体项目，把你的行动和结果再展开一下？";
  }
}

async function scoreSessionAnswer(
  principal: ExecutionPrincipal,
  session: DurableInterviewSession,
  answer: string,
  signal: AbortSignal | undefined,
  sessionId?: number,
): Promise<{
  score: number | null;
  feedback: string;
  rubric?: { bands: Record<string, number>; overallBand: number; evidence: Record<string, string>; states: Record<string, string>; review: { effectiveEvidence: string; mainGaps: string; stateVerdict: string; betterStructure: string } };
}> {
  try {
    const result = await scoreInterviewAnswerForAgent(principal, {
      question: session.currentQuestion?.text || "模拟面试回答",
      answer,
      mode: session.phase === "behavioral" ? "behavioral" : "structured-sme",
      context: formatSessionBinding(session),
      sessionId,
      family: familyForRole(session.role),
    }, { signal, deferTrendWriteback: true });
    // Spec 26 复盘固定格式：三态判定/主要缺口/更好结构优先于泛泛建议
    const rubric = result.score as AnswerScore & { review?: RubricScoredAnswer["review"] };
    const reviewParts = rubric.review
      ? [rubric.review.stateVerdict, rubric.review.mainGaps, rubric.review.betterStructure].filter(Boolean)
      : [];
    const feedback = reviewParts.length
      ? reviewParts.join("；")
      : result.score.suggestions.join("；") || "回答已记录，请继续保持结构化表达。";
    // Spec 30 / WP1：rubric 细节随 score 透传，调用方持久化进 session.answers[].rubric
    const extended = rubric as unknown as { bands?: Record<string, number>; overallBand?: number; evidence?: Record<string, string>; states?: Record<string, string>; review?: RubricScoredAnswer["review"] };
    const rubricData = extended.bands
      ? {
          bands: extended.bands,
          overallBand: extended.overallBand ?? 0,
          evidence: extended.evidence ?? {},
          states: extended.states ?? {},
          review: extended.review ?? { effectiveEvidence: "", mainGaps: "", stateVerdict: "", betterStructure: "" },
        }
      : undefined;
    return {
      score: rubricData ? Math.round(result.score.overall * 20) / 10 : null,
      feedback,
      rubric: rubricData,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      score: null,
      feedback: "回答已保存，但本轮自动评分暂时不可用；会话已继续，不需要重复作答。",
    };
  }
}

async function persistInterviewCheckpoint(
  principal: ExecutionPrincipal,
  sessionId: number,
  session: DurableInterviewSession,
  previousAgentState: Record<string, unknown>,
  turnFingerprint: string,
  result: InterviewSessionTurnResult,
): Promise<void> {
  const expectedVersion = Math.max(0, Number(session.checkpointVersion) || 0);
  session.checkpointVersion = Math.max(0, Number(session.checkpointVersion) || 0) + 1;
  result.evidence = interviewStateEvidence(sessionId, session, result.action || "started", turnFingerprint);
  const updated = await getDataRepositories().sessions.update(sessionId, principal.userId, {
    interviewState: session,
    expectedInterviewCheckpointVersion: expectedVersion,
    agentState: {
      ...previousAgentState,
      durableInterview: true,
      checkpointVersion: session.checkpointVersion,
      checkpointStateHash: interviewCheckpointHash(session),
      lastTurnFingerprint: turnFingerprint,
      lastTurnResult: result,
    },
    memoryDigest: result.summary?.slice(0, 300),
  });
  if (!updated) throw new InterviewCheckpointConflictError();
  await verifyInterviewCheckpoint(principal, sessionId, session.checkpointVersion, session);
}

async function persistVerifiedInterviewWeakness(principal: ExecutionPrincipal, sessionId: number, session: DurableInterviewSession): Promise<void> {
  const answer = session.answers.at(-1);
  if (!answer?.rubric) return;
  await persistInterviewWeaknessEvents(principal, answer.rubric.bands, sessionSurrogateFor(String(sessionId), answer.question, answer.answer), familyForRole(session.role));
}

async function persistInterviewWeaknessEvents(principal: ExecutionPrincipal, bands: Record<string, number>, sessionSurrogate: string, family: string): Promise<void> {
  for (const dimension of ["structure", "specificity", "highlight", "timing"] as const) {
    try {
      await recordWeaknessEvent({ userId: principal.userId, sessionSurrogate, dimension, band: bands[dimension], topic: family });
    } catch (error) { console.warn("[interview-trend] 弱项事件记录失败（不阻塞评分）:", error instanceof Error ? error.message : error); }
  }
}

async function verifyInterviewCheckpoint(
  principal: ExecutionPrincipal,
  sessionId: number,
  checkpointVersion: number,
  expected?: DurableInterviewSession,
): Promise<void> {
  const readBack = await getDataRepositories().sessions.get(sessionId, principal.userId);
  const state = parseJsonUnknownObject(readBack?.interview_state_json);
  const agentState = parseJsonUnknownObject(readBack?.agent_state_json);
  if (!readBack || Number(state.checkpointVersion) !== checkpointVersion) {
    throw new Error("模拟面试会话持久化后读回校验失败");
  }
  if (agentState.checkpointStateHash && stringValue(agentState.checkpointStateHash) !== interviewCheckpointHash(state)) {
    throw new Error("模拟面试会话持久化后读回内容不一致");
  }
  if (expected && INTERVIEW_CHECKPOINT_FIELDS.some((field) => canonicalInterviewValue(state[field]) !== canonicalInterviewValue((expected as unknown as Record<string, unknown>)[field]))) {
    throw new Error("模拟面试会话持久化后读回内容不一致");
  }
}

function canonicalInterviewValue(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([first], [second]) => first.localeCompare(second)))
    : item);
}

function interviewCheckpointHash(value: DurableInterviewSession | Record<string, unknown>): string {
  const state = value as unknown as Record<string, unknown>;
  return createHash("sha256").update(canonicalInterviewValue(Object.fromEntries(
    INTERVIEW_CHECKPOINT_FIELDS.map((field) => [field, state[field]]),
  )) || "").digest("hex");
}

function interviewStateEvidence(sessionId: number, session: DurableInterviewSession, action: string, turnFingerprint?: string) {
  return {
    conversationId: sessionId, checkpointVersion: session.checkpointVersion || 0,
    questionId: session.currentFollowups.length
      ? `${session.currentQuestion?.id}_followup_${session.currentFollowups.length}` : session.currentQuestion?.id,
    engineSessionId: session.id, turnFingerprint, action, status: session.status || "active", readBackVerified: true,
    requiresReview: session.legacyRecovery?.requiresReview === true || session.pendingMaterialChange?.requiresReview === true,
  };
}

function parseInterviewSession(value: unknown): DurableInterviewSession | null {
  const parsed = parseJsonUnknownObject(value);
  const company = stringValue(parsed.company);
  const role = stringValue(parsed.role);
  const phase = stringValue(parsed.phase) as InterviewPhase;
  if (!company || !role || !["intro", "tech", "behavioral", "reverse", "summary", "done"].includes(phase)) {
    return null;
  }
  return {
    id: stringValue(parsed.id) || `persisted_${Date.now()}`,
    company,
    role,
    sourceBinding: parseJsonUnknownObject(parsed.sourceBinding) as InterviewSession["sourceBinding"],
    phase,
    questionIndex: Math.max(0, Number(parsed.questionIndex) || 0),
    questions: arrayValue(parsed.questions) as InterviewSession["questions"],
    answers: arrayValue(parsed.answers) as InterviewSession["answers"],
    currentQuestion: Object.keys(parseJsonUnknownObject(parsed.currentQuestion)).length
      ? parseJsonUnknownObject(parsed.currentQuestion) as unknown as InterviewSession["currentQuestion"]
      : undefined,
    currentFollowups: arrayValue(parsed.currentFollowups).map(String),
    checkpointVersion: Math.max(0, Number(parsed.checkpointVersion) || 0),
    pendingAnswer: stringValue(parsed.pendingAnswer) || undefined,
    pendingFollowupAnswers: parsed.pendingFollowupAnswers === undefined ? undefined : arrayValue(parsed.pendingFollowupAnswers).map(String),
    status: ["active", "paused", "completed", "abandoned"].includes(stringValue(parsed.status))
      ? stringValue(parsed.status) as InterviewSession["status"]
      : phase === "done" ? "completed" : "active",
    createdAt: stringValue(parsed.createdAt) || undefined,
    snapshotId: stringValue(parsed.snapshotId) || undefined,
    mode: stringValue(parsed.mode) || undefined,
    difficulty: parsed.difficulty as InterviewSession["difficulty"],
    focus: stringValue(parsed.focus) || undefined,
    focusAreas: arrayValue(parsed.focusAreas).map(String),
    allowFollowUps: parsed.allowFollowUps !== false,
    legacyRecovery: Object.keys(parseJsonUnknownObject(parsed.legacyRecovery)).length
      ? parseJsonUnknownObject(parsed.legacyRecovery) as DurableInterviewSession["legacyRecovery"] : undefined,
    pendingMaterialChange: Object.keys(parseJsonUnknownObject(parsed.pendingMaterialChange)).length
      ? parseJsonUnknownObject(parsed.pendingMaterialChange) as DurableInterviewSession["pendingMaterialChange"] : undefined,
  };
}

function createQuestionId(session: DurableInterviewSession): string {
  return `q_${session.phase}_${session.questionIndex}_${Math.max(0, Number(session.checkpointVersion) || 0) + 1}`;
}

function questionTypeForPhase(phase: InterviewPhase): "tech" | "behavioral" | "reverse" {
  if (phase === "behavioral") return "behavioral";
  if (phase === "reverse") return "reverse";
  return "tech";
}

function categoriesForPhase(phase: InterviewPhase): InterviewQuestion["category"][] {
  if (phase === "behavioral") return ["behavioral"];
  if (phase === "reverse") return ["culture"];
  return ["technical"];
}

function fallbackSessionQuestion(phase: InterviewPhase): string {
  if (phase === "intro") return "请用 1-2 分钟介绍一下你自己，并说明你和这个岗位最相关的一段经历。";
  if (phase === "behavioral") return "请介绍一次你推动跨团队协作并解决分歧的经历。";
  if (phase === "reverse") return "你最希望向面试官了解这个岗位或团队的哪一点？";
  return "请选择一个最相关的项目，说明你的判断、行动和可量化结果。";
}

function formatSessionBinding(session: DurableInterviewSession): string {
  return [
    `公司：${session.company}`,
    `岗位：${session.role}`,
    session.sourceBinding?.jdText ? `JD：${session.sourceBinding.jdText.slice(0, 1800)}` : "",
    session.sourceBinding?.cvText ? `简历：${session.sourceBinding.cvText.slice(0, 1800)}` : "",
    session.sourceBinding?.memoryContext ? `长期记忆：${session.sourceBinding.memoryContext.slice(0, 1200)}` : "",
  ].filter(Boolean).join("\n");
}

function buildInterviewSummary(session: DurableInterviewSession): string {
  const scored = session.answers.filter((answer) => Number.isFinite(answer.score));
  const average = scored.length
    ? (scored.reduce((total, answer) => total + Number(answer.score), 0) / scored.length).toFixed(1)
    : "暂缺";
  const suggestions = session.answers.map((answer) => answer.feedback).filter(Boolean).slice(-3);
  return [
    `模拟面试完成，共记录 ${session.answers.length} 道回答。`,
    `可用评分平均分：${average}${average === "暂缺" ? "" : "/10"}。`,
    suggestions.length ? `重点改进：${suggestions.join("；")}` : "评分服务暂不可用，回答均已保存，可稍后复盘。",
  ].join("\n");
}

function normalizeQuestion(value: unknown): InterviewQuestion[] {
  const item = objectValue(value);
  const question = stringValue(item.question);
  if (!question) return [];
  const category = ["behavioral", "technical", "case-study", "culture"].includes(stringValue(item.category))
    ? stringValue(item.category) as InterviewQuestion["category"]
    : "behavioral";
  const source = ["jd", "bank", "weakness", "general"].includes(stringValue(item.source))
    ? stringValue(item.source) as InterviewQuestion["source"]
    : "general";
  return [{
    category,
    question,
    context: stringValue(item.context),
    storyHint: stringValue(item.storyHint),
    source,
    weaknessNote: stringValue(item.weaknessNote) || undefined,
  }];
}

// normalizeScore 已随 Spec 26 锚定评分删除（评分语义移至 interview-rubric.ts）

function requireApiKey(): string {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  return apiKey;
}

function normalizeMode(value: unknown): CoachMode {
  return typeof value === "string" && value in COACH_MODES ? value as CoachMode : "behavioral";
}

function parseJsonObject(value: string): Record<string, unknown> {
  const normalized = value.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return objectValue(JSON.parse(normalized)); } catch {
    const match = normalized.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return objectValue(JSON.parse(match[0])); } catch { return {}; }
  }
}

function parseJsonUnknownObject(value: unknown): Record<string, unknown> {
  try {
    return objectValue(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return {};
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
