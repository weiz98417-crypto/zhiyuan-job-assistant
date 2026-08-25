import { createHash } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { assembleAgentMemoryContext, type AgentMemoryContext } from "@/lib/agent/memory-context";
import {
  advance,
  createSession as createInterviewSession,
  getPhasePrompt,
  nextAction,
  type InterviewPhase,
  type InterviewSession,
} from "@/lib/agent/interview/engine";
import { getDataRepositories } from "@/lib/data-repositories";
import { llmRetry } from "@/lib/llm-retry";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { addMemoryEvidence, createMemoryItem, listMemoryItems } from "@/lib/memory/postgres-memory";
import { COACH_MODES, type AnswerScore, type CoachMode, type InterviewQuestion } from "@/types";

const MODE_WEIGHTS: Record<CoachMode, Record<keyof AnswerScore["dimensions"], number>> = {
  "project-review": { structure: 0.30, specificity: 0.30, highlight: 0.25, timing: 0.15 },
  behavioral: { structure: 0.30, specificity: 0.30, highlight: 0.25, timing: 0.15 },
  scenario: { structure: 0.25, specificity: 0.25, highlight: 0.30, timing: 0.20 },
  "structured-sme": { structure: 0.30, specificity: 0.35, highlight: 0.20, timing: 0.15 },
  founder: { structure: 0.20, specificity: 0.25, highlight: 0.35, timing: 0.20 },
  stability: { structure: 0.40, specificity: 0.20, highlight: 0.10, timing: 0.30 },
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
}

export interface ScoreInterviewAnswerInput {
  question: string;
  answer: string;
  mode?: CoachMode;
  context?: string;
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
  const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
    model: process.env.DEEPSEEK_INTERVIEW_MODEL?.trim() || "deepseek-v4-flash",
    messages: [
      {
        role: "system",
        content: `你是资深面试教练。当前模式：${modeInfo.label}，回答框架：${modeInfo.structure.join(" → ")}。只生成 ${count} 道清晰、口语化的问题。${categories.length ? `题目类别只使用：${categories.join("、")}。` : "题目均匀覆盖 behavioral、technical、case-study、culture。"}严格返回 JSON：{"questions":[{"category":"behavioral|technical|case-study|culture","question":"问题","context":"考察点","storyHint":"准备方向","source":"jd|weakness|general"}]}`,
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
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
    signal: options.signal,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = parseJsonObject(payload.choices?.[0]?.message?.content || "{}");
  const questions = arrayValue(parsed.questions).slice(0, count).flatMap(normalizeQuestion);
  if (questions.length === 0) throw new Error("AI 未能生成有效面试题");
  return { questions, company, role, mode, memoryContext };
}

export async function scoreInterviewAnswerForAgent(
  principal: ExecutionPrincipal,
  input: ScoreInterviewAnswerInput,
  options: { signal?: AbortSignal } = {},
): Promise<{
  score: AnswerScore;
  memoryContext: AgentMemoryContext;
  memoryWriteback: { status: "persisted" | "skipped" | "failed"; readBackVerified: boolean; id?: number; error?: string };
}> {
  const question = stringValue(input.question);
  const answer = stringValue(input.answer);
  if (!question || !answer) throw new Error("请提供题目 question 和回答 answer");
  const apiKey = requireApiKey();
  const mode = normalizeMode(input.mode);
  const memoryContext = await assembleAgentMemoryContext({
    userId: principal.userId,
    task: "interview_coaching",
    agentId: "interview",
    query: `${question}\n${answer}\n${stringValue(input.context)}`,
    budgetChars: 800,
    semanticTopK: 4,
  });
  const weights = MODE_WEIGHTS[mode];
  const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
    model: process.env.DEEPSEEK_INTERVIEW_MODEL?.trim() || "deepseek-v4-flash",
    messages: [
      {
        role: "system",
        content: `你是资深面试教练。按结构${weights.structure}、具体${weights.specificity}、亮点${weights.highlight}、时间${weights.timing}评分。严格返回 JSON：{"dimensions":{"structure":4,"specificity":4,"highlight":3,"timing":4},"overall":3.75,"suggestions":[],"segmentFeedback":[]}`,
      },
      {
        role: "user",
        content: `题目：${question}\n回答：${answer}\n上下文：${stringValue(input.context).slice(0, 1000)}\n长期记忆：${memoryContext.llmSummary}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 1600,
    response_format: { type: "json_object" },
    retries: 2,
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
    signal: options.signal,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const score = normalizeScore(parseJsonObject(payload.choices?.[0]?.message?.content || "{}"));
  const memoryWriteback = await persistInterviewObservation(principal, question, answer, mode, score);
  return { score, memoryContext, memoryWriteback };
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

  const action = nextAction(session, answer);
  if (action === "followup") {
    if (!session.pendingAnswer) session.pendingAnswer = answer;
    const question = await generateFollowUpQuestion(principal, session, answer, options.signal);
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
  const scored = await scoreSessionAnswer(principal, session, completeAnswer, options.signal);
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

async function persistInterviewObservation(
  principal: ExecutionPrincipal,
  question: string,
  answer: string,
  mode: CoachMode,
  score: AnswerScore,
): Promise<{ status: "persisted" | "skipped" | "failed"; readBackVerified: boolean; id?: number; error?: string }> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return { status: "skipped", readBackVerified: false };
  }
  const fingerprint = createHash("sha256").update(`${question}\u0000${answer}`).digest("hex");
  const canonicalText = `Interview answer scored ${score.overall}/5 for question: ${question.slice(0, 120)}. [${fingerprint.slice(0, 12)}]`;
  try {
    const existing = (await listMemoryItems({
      userId: principal.userId,
      memoryTypes: ["interview_observation"],
      statuses: ["candidate", "active"],
      limit: 200,
    })).find((item) => item.canonical_text === canonicalText);
    if (existing) return { status: "persisted", readBackVerified: true, id: existing.id };
    const id = await createMemoryItem({
      userId: principal.userId,
      memoryType: "interview_observation",
      canonicalText,
      status: "candidate",
      confidence: 0.6,
      importance: score.overall < 3 ? 0.75 : 0.55,
      sourceCount: 1,
      metadata: { question, mode, suggestions: score.suggestions, fingerprint },
    });
    await addMemoryEvidence({
      userId: principal.userId,
      memoryItemId: id,
      sourceType: "interview_answer",
      sourceId: fingerprint,
      quote: answer.slice(0, 800),
      extractionMethod: "interview_answer_score",
      confidence: 0.6,
      metadata: { question, mode },
    });
    return { status: "persisted", readBackVerified: true, id };
  } catch (error) {
    return { status: "failed", readBackVerified: false, error: error instanceof Error ? error.message : String(error) };
  }
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
      additionalContext: `原题：${session.currentQuestion?.text || ""}\n候选人回答：${answer}\n只提出一个用于补充事实和结果的追问。`,
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
  signal?: AbortSignal,
): Promise<{ score: number | null; feedback: string }> {
  try {
    const result = await scoreInterviewAnswerForAgent(principal, {
      question: session.currentQuestion?.text || "模拟面试回答",
      answer,
      mode: session.phase === "behavioral" ? "behavioral" : "structured-sme",
      context: formatSessionBinding(session),
    }, { signal });
    return {
      score: Math.round(result.score.overall * 20) / 10,
      feedback: result.score.suggestions.join("；") || "回答已记录，请继续保持结构化表达。",
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
  const source = ["jd", "weakness", "general"].includes(stringValue(item.source))
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

function normalizeScore(parsed: Record<string, unknown>): AnswerScore {
  const dimensions = objectValue(parsed.dimensions);
  if (parsed.overall === undefined) throw new Error("AI 未能生成有效评分");
  return {
    dimensions: {
      structure: boundedScore(dimensions.structure),
      specificity: boundedScore(dimensions.specificity),
      highlight: boundedScore(dimensions.highlight),
      timing: boundedScore(dimensions.timing),
    },
    overall: boundedScore(parsed.overall),
    suggestions: arrayValue(parsed.suggestions).map(String).filter(Boolean),
    segmentFeedback: arrayValue(parsed.segmentFeedback).flatMap((value) => {
      const item = objectValue(value);
      const text = stringValue(item.text);
      if (!text) return [];
      const rating = ["good", "expand", "compress"].includes(stringValue(item.rating))
        ? stringValue(item.rating) as "good" | "expand" | "compress"
        : "expand";
      return [{ text, rating }];
    }),
  };
}

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

function boundedScore(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(5, parsed)) : 3;
}
