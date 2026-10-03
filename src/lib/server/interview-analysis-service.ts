import { createHash } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { assembleAgentMemoryContext, type AgentMemoryContext } from "@/lib/agent/memory-context";
import {
  advance,
  createSession as createInterviewSession,
  getPhasePrompt,
  type InterviewPhase,
  type InterviewSession,
} from "@/lib/agent/interview/engine";
import { getDataRepositories } from "@/lib/data-repositories";
import { llmRetry } from "@/lib/llm-retry";
import { loadRegistryText } from "@/lib/agent/knowledge/registry/loader";
import { scoreAnswerWithRubric, type RubricCompletion, type RubricScoredAnswer, type RubricScoringResult } from "@/lib/server/interview-rubric";
import { recordWeaknessEvent } from "@/lib/server/interview-trend";
import { composeInterview, familyForRole, type QuestionBankStore } from "@/lib/server/question-bank";
import { getPostgresPool } from "@/lib/postgres";
import { COACH_MODES, type AnswerScore, type CoachMode, type InterviewQuestion } from "@/types";

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
}

export class InterviewSessionNotFoundError extends Error {
  constructor() {
    super("会话不存在或已过期");
    this.name = "InterviewSessionNotFoundError";
  }
}

type DurableInterviewSession = InterviewSession & {
  checkpointVersion?: number;
  pendingAnswer?: string;
};

type InterviewSessionTurnResult = {
  action?: "followup" | "next" | "done";
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
  options: { signal?: AbortSignal } = {},
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
    score = {
      dimensions: { structure: 0, specificity: 0, highlight: 0, timing: 0 },
      overall: 0,
      suggestions: [`本轮未评分：${(rubricResult as { reason: string }).reason}`],
      segmentFeedback: [],
    };
  } else {
    score = rubricToAnswerScore(rubricResult, mode);
    // 弱项趋势：档位 ≤1 的维度记录事件（topic=岗位族，维度×岗位族粒度）；
    // 跨 ≥3 场提炼候选事实（单场不入账本）。surrogate 前缀区分真实会话（sess:）与
    // 独立评分指纹（fp:）——ADR-0042 的「≥3 场」只数真实会话（eng review S1-5）。
    const sessionSurrogate = stringValue(input.sessionId)
      ? `sess:${stringValue(input.sessionId)}`
      : `fp:${createHash("sha256").update(`${question}\u0000${answer}`).digest("hex").slice(0, 16)}`;
    const family = stringValue(input.family) || "general";
    for (const dimension of ["structure", "specificity", "highlight", "timing"] as const) {
      try {
        await recordWeaknessEvent({
          userId: principal.userId,
          sessionSurrogate,
          dimension,
          band: rubricResult.bands[dimension],
          topic: family,
        });
      } catch (error) { console.warn("[interview-trend] 弱项事件记录失败（不阻塞评分）:", error instanceof Error ? error.message : error); }
    }
  }

  return { score, memoryContext, memoryWriteback: { ...SKIPPED_MEMORY_WRITEBACK } };
}

/** RubricScoredAnswer → 旧 AnswerScore 形状（UI/工具兼容）；bands/evidence/states 附加字段透传。 */
function rubricToAnswerScore(rubric: RubricScoredAnswer, _mode: CoachMode): AnswerScore & Partial<RubricScoredAnswer> {
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
    const company = stringValue(input.company);
    const role = stringValue(input.role);
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
    const question = await generateSessionQuestion(principal, session, options.signal);
    session.currentQuestion = {
      id: createQuestionId(session),
      phase: session.phase,
      text: question,
      type: questionTypeForPhase(session.phase),
    };
    session.checkpointVersion = 1;
    const sessionId = await repositories.sessions.create({
      title: `${company} ${role} 模拟面试`,
      messages: [assistantInterviewMessage(question)],
      interviewState: session,
      agentState: {
        durableInterview: true,
        requestKey: stringValue(input.requestKey) || undefined,
        checkpointVersion: session.checkpointVersion,
      },
      memoryDigest: memory.llmSummary.slice(0, 300),
    }, principal.userId);
    await verifyInterviewCheckpoint(principal, sessionId, session.checkpointVersion);
    return {
      sessionId: String(sessionId),
      phase: session.phase,
      question,
      questionIndex: session.questionIndex,
      sourceBinding: session.sourceBinding,
      readBackVerified: true,
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
  const messages = parseMessages(row.messages_json);
  const turnFingerprint = createHash("sha256")
    .update(stringValue(input.requestKey)
      ? `${sessionId}\u0000request\u0000${stringValue(input.requestKey)}`
      : `${sessionId}\u0000${session.currentQuestion?.id || ""}\u0000${answer}`)
    .digest("hex");
  if (stringValue(agentState.lastTurnFingerprint) === turnFingerprint) {
    const cached = parseJsonUnknownObject(agentState.lastTurnResult) as InterviewSessionTurnResult;
    if (stringValue(cached.sessionId) === String(sessionId)) {
      return { ...cached, readBackVerified: true, recovered: true };
    }
  }

  // Spec 27：追问判定从纯长度规则升级为内容缺口判定（LLM 不可用时长度规则兜底）。
  // 硬上限（eng review S1-4）：每主问题 ≤2 次追问，reverse 阶段不追问——防无限横链。
  const followUpAllowed = session.phase !== "reverse" && session.currentFollowups.length < 2;
  const gapDecision = await decideFollowUp(answer, session.currentQuestion?.text || "", {
    completion: overrides.followUpCompletion,
    signal: options.signal,
  });
  if (gapDecision.followUp && followUpAllowed) {
    if (!session.pendingAnswer) session.pendingAnswer = answer;
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
    await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result, [
      ...messages,
      userInterviewMessage(answer),
      assistantInterviewMessage(question),
    ]);
    return result;
  }

  const completeAnswer = session.pendingAnswer
    ? `${session.pendingAnswer}\n\n追问回答：${answer}`
    : answer;
  const scored = await scoreSessionAnswer(principal, session, completeAnswer, options.signal, sessionId);
  session.answers.push({
    questionId: session.currentQuestion?.id || "",
    question: session.currentQuestion?.text || "",
    answer: completeAnswer,
    score: scored.score ?? undefined,
    feedback: scored.feedback,
    followups: session.currentFollowups.map((question) => ({ question, answer })),
  });
  session.pendingAnswer = undefined;
  advance(session);

  if (session.phase === "done") {
    const summary = buildInterviewSummary(session);
    // Spec 29：复盘有效证据 → 经历故事册候选（用户确认后激活；失败不阻塞复盘）。
    // item.score 是 /10 刻度（overall 1-5 ×2）：band = round(score/2) - 1，即 overall≥4 才算 band≥3。
    try {
      const { recordStoryCandidates } = await import("@/lib/server/interview-story-bank");
      await recordStoryCandidates(principal, session.answers.map((item) => ({
        question: item.question,
        answer: item.answer,
        scoreBand: Math.max(0, Math.round((item.score || 0) / 2) - 1),
        topic: item.question.slice(0, 120),
      })));
    } catch (error) { console.warn("[interview-story] 故事册沉淀失败（不阻塞复盘）:", error instanceof Error ? error.message : error); }
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
    await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result, [
      ...messages,
      userInterviewMessage(answer),
      assistantInterviewMessage(summary),
    ]);
    return result;
  }

  const question = await generateSessionQuestion(principal, session, options.signal);
  session.currentQuestion = {
    id: createQuestionId(session),
    phase: session.phase,
    text: question,
    type: questionTypeForPhase(session.phase),
  };
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
  await persistInterviewCheckpoint(principal, sessionId, session, agentState, turnFingerprint, result, [
    ...messages,
    userInterviewMessage(answer),
    assistantInterviewMessage(question),
  ]);
  return result;
}

export async function startInterviewSessionForAgent(
  principal: ExecutionPrincipal,
  input: StartInterviewSessionInput,
  options: { signal?: AbortSignal } = {},
): Promise<{ sessionId: string; phase: "intro"; question: string; readBackVerified: true }> {
  const company = stringValue(input.company);
  const role = stringValue(input.role);
  if (!company || !role) throw new Error("请提供公司和岗位");
  const repositories = getDataRepositories();
  const existing = (await repositories.sessions.list(principal.userId)).find((row) => {
    const agentState = parseJsonUnknownObject(row.agent_state_json);
    return stringValue(agentState.requestKey) === input.requestKey;
  });
  if (existing) {
    const interviewState = parseJsonUnknownObject(existing.interview_state_json);
    const question = stringValue(interviewState.question);
    if (question) {
      return { sessionId: String(existing.id), phase: "intro", question, readBackVerified: true };
    }
  }

  const generated = await generateInterviewQuestionsForAgent(principal, {
    company,
    role,
    mode: "behavioral",
    count: 1,
  }, options);
  const question = generated.questions[0].question;
  const interviewState = {
    phase: "intro",
    question,
    questionIndex: 0,
    company,
    role,
    difficulty: stringValue(input.difficulty) || "mid",
    focus: stringValue(input.focus) || "all",
    planSnapshot: { company, role, mode: generated.mode },
  };
  const sessionId = await repositories.sessions.create({
    title: `${company} ${role} 模拟面试`,
    messages: [{ role: "assistant", content: question, agent_id: "interview", timestamp: new Date().toISOString() }],
    interviewState,
    agentState: { requestKey: input.requestKey, durable: true },
    memoryDigest: generated.memoryContext.llmSummary.slice(0, 300),
  }, principal.userId);
  const readBack = await repositories.sessions.get(sessionId, principal.userId);
  const readBackState = parseJsonUnknownObject(readBack?.interview_state_json);
  const readBackAgentState = parseJsonUnknownObject(readBack?.agent_state_json);
  if (
    Number(readBack?.id) !== sessionId
    || stringValue(readBackState.question) !== question
    || stringValue(readBackAgentState.requestKey) !== input.requestKey
  ) {
    throw new Error("模拟面试会话持久化后读回校验失败");
  }
  return { sessionId: String(sessionId), phase: "intro", question, readBackVerified: true };
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
): Promise<{ score: number | null; feedback: string }> {
  try {
    const result = await scoreInterviewAnswerForAgent(principal, {
      question: session.currentQuestion?.text || "模拟面试回答",
      answer,
      mode: session.phase === "behavioral" ? "behavioral" : "structured-sme",
      context: formatSessionBinding(session),
      sessionId,
      family: familyForRole(session.role),
    }, { signal });
    // Spec 26 复盘固定格式：三态判定/主要缺口/更好结构优先于泛泛建议
    const rubric = result.score as AnswerScore & { review?: RubricScoredAnswer["review"] };
    const reviewParts = rubric.review
      ? [rubric.review.stateVerdict, rubric.review.mainGaps, rubric.review.betterStructure].filter(Boolean)
      : [];
    const feedback = reviewParts.length
      ? reviewParts.join("；")
      : result.score.suggestions.join("；") || "回答已记录，请继续保持结构化表达。";
    return {
      score: Math.round(result.score.overall * 20) / 10,
      feedback,
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
  messages: Array<Record<string, unknown>>,
): Promise<void> {
  session.checkpointVersion = Math.max(0, Number(session.checkpointVersion) || 0) + 1;
  const updated = await getDataRepositories().sessions.update(sessionId, principal.userId, {
    messages,
    interviewState: session,
    agentState: {
      ...previousAgentState,
      durableInterview: true,
      checkpointVersion: session.checkpointVersion,
      lastTurnFingerprint: turnFingerprint,
      lastTurnResult: result,
    },
    memoryDigest: result.summary?.slice(0, 300),
  });
  if (!updated) throw new InterviewSessionNotFoundError();
  await verifyInterviewCheckpoint(principal, sessionId, session.checkpointVersion);
}

async function verifyInterviewCheckpoint(
  principal: ExecutionPrincipal,
  sessionId: number,
  checkpointVersion: number,
): Promise<void> {
  const readBack = await getDataRepositories().sessions.get(sessionId, principal.userId);
  const state = parseJsonUnknownObject(readBack?.interview_state_json);
  if (!readBack || Number(state.checkpointVersion) !== checkpointVersion) {
    throw new Error("模拟面试会话持久化后读回校验失败");
  }
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
  };
}

function parseMessages(value: unknown): Array<Record<string, unknown>> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
}

function assistantInterviewMessage(content: string): Record<string, unknown> {
  return { role: "assistant", content, mode: "interview-coach", agent_id: "interview", timestamp: new Date().toISOString() };
}

function userInterviewMessage(content: string): Record<string, unknown> {
  return { role: "user", content, mode: "interview-coach", agent_id: "interview", timestamp: new Date().toISOString() };
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

