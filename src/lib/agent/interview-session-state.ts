import type {
  AgentMessage,
  ChatSession,
  InterviewPlanSnapshot,
  InterviewQuestionKind,
  InterviewQuestionNode,
  InterviewRecap,
  InterviewRebindEvent,
  InterviewScore,
  InterviewScoreArtifact,
  InterviewSessionState,
  InterviewTurn,
  JDRecord,
} from "@/types";

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildInterviewPlanSnapshot(input: {
  jd?: JDRecord | null;
  resumeText?: string;
  resumeTitle?: string;
  mode?: string;
  difficulty?: "normal" | "hard" | "pressure";
  focusAreas?: string[];
  allowFollowUps?: boolean;
}): InterviewPlanSnapshot {
  return {
    snapshotId: makeId("plan"),
    source: {
      jdId: input.jd?.id,
      resumeId: input.resumeTitle || "active-resume",
    },
    jdSnapshot: input.jd
      ? {
          company: input.jd.company,
          role: input.jd.role,
          body: input.jd.body,
        }
      : undefined,
    resumeSnapshot: input.resumeText
      ? {
          title: input.resumeTitle || "当前简历",
          body: input.resumeText,
        }
      : undefined,
    mode: input.mode || "realistic",
    difficulty: input.difficulty || "normal",
    focusAreas: input.focusAreas || [],
    allowFollowUps: input.allowFollowUps ?? true,
    createdAt: new Date().toISOString(),
  };
}

export function createInterviewState(planSnapshot: InterviewPlanSnapshot): InterviewSessionState {
  return {
    planSnapshot,
    status: "active",
    questionGraph: [],
    transcript: [],
    scoreArtifacts: [],
    rebindHistory: [],
  };
}

export function interviewTitleFromPlan(plan: InterviewPlanSnapshot): string {
  const company = plan.jdSnapshot?.company?.trim() || "模拟面试";
  const role = plan.jdSnapshot?.role?.trim() || "目标岗位";
  return `${company} ${role} 面试模拟`;
}

export function isInterviewSession(session: ChatSession): boolean {
  if (session.interviewState?.planSnapshot) return true;
  const messages = session.messages || [];
  return messages.some((m) => m.agent_id === "interview" || m.mode === "interview-coach");
}

function looksLikeInterviewQuestion(content: string): boolean {
  const text = content.trim();
  return !!text && (/[?？]/.test(text) || /第\s*\d+\s*题|追问|请你|能否|可以|怎么|为什么|举例|展开|介绍/.test(text));
}

function inferQuestionKind(content: string, state: InterviewSessionState): InterviewQuestionKind {
  const text = content.trim();
  const hasQuestion = looksLikeInterviewQuestion(text);
  if (!hasQuestion) return "probe";
  if (!state.currentQuestionId || state.questionGraph.length === 0) return "main";
  if (/追问|展开|具体|细节|刚才|你提到|为什么|举例/.test(text)) return "follow_up";
  if (/你有什么问题|反问|想问我/.test(text)) return "reverse_question";
  return "main";
}

function extractQuestion(content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const questionLine = [...lines].reverse().find((line) => /[?？]/.test(line));
  return questionLine || lines[0] || content.trim().slice(0, 120);
}

function appendAssistantTurn(
  state: InterviewSessionState,
  assistantMsg: AgentMessage,
): InterviewSessionState {
  const next: InterviewSessionState = {
    ...state,
    transcript: [...state.transcript],
    questionGraph: [...state.questionGraph],
    scoreArtifacts: [...(state.scoreArtifacts || [])],
  };

  const assistantText = assistantMsg.content.trim();
  let nodeId = next.currentQuestionId;

  if (looksLikeInterviewQuestion(assistantText)) {
    const kind = inferQuestionKind(assistantText, next);
    const parentId = kind === "follow_up" || kind === "probe" || kind === "clarification"
      ? next.currentQuestionId
      : undefined;
    const node: InterviewQuestionNode = {
      id: makeId("q"),
      kind,
      parentId,
      reason: parentId ? "基于上一轮回答的自然追问" : "面试主线推进",
      question: extractQuestion(assistantText),
      answerTurnIds: [],
      createdAt: assistantMsg.timestamp || new Date().toISOString(),
    };
    next.questionGraph.push(node);
    next.currentQuestionId = node.id;
    nodeId = node.id;
  }

  next.transcript.push({
    id: makeId("turn_assistant"),
    role: "assistant",
    content: assistantMsg.content,
    questionNodeId: nodeId,
    createdAt: assistantMsg.timestamp || new Date().toISOString(),
  });

  return next;
}

export function updateInterviewStateWithExchange(
  state: InterviewSessionState | undefined,
  userMsg: AgentMessage,
  assistantMsg: AgentMessage,
): InterviewSessionState | undefined {
  if (!state?.planSnapshot) return state;

  const next: InterviewSessionState = {
    ...state,
    transcript: [...state.transcript],
    questionGraph: [...state.questionGraph],
    scoreArtifacts: [...(state.scoreArtifacts || [])],
  };

  const userTurn: InterviewTurn = {
    id: makeId("turn_user"),
    role: "user",
    content: userMsg.content,
    questionNodeId: next.currentQuestionId,
    createdAt: userMsg.timestamp || new Date().toISOString(),
  };
  next.transcript.push(userTurn);

  if (next.currentQuestionId) {
    next.questionGraph = next.questionGraph.map((node) =>
      node.id === next.currentQuestionId
        ? { ...node, answerTurnIds: [...node.answerTurnIds, userTurn.id] }
        : node,
    );
  }

  return appendAssistantTurn(next, assistantMsg);
}

export function updateInterviewStateWithAssistantMessage(
  state: InterviewSessionState | undefined,
  assistantMsg: AgentMessage,
): InterviewSessionState | undefined {
  if (!state?.planSnapshot) return state;
  return appendAssistantTurn(state, assistantMsg);
}

function normalizeInterviewScore(value: unknown): InterviewScore | null {
  const raw = value as (Partial<InterviewScore> & { suggestions?: unknown }) | undefined;
  if (!raw || typeof raw !== "object" || typeof raw.overall !== "number") return null;
  return {
    overall: raw.overall,
    dimensions: raw.dimensions && typeof raw.dimensions === "object" ? raw.dimensions : undefined,
    feedback: typeof raw.feedback === "string"
      ? raw.feedback
      : Array.isArray(raw.suggestions)
        ? raw.suggestions.filter((item): item is string => typeof item === "string").join("\n")
        : undefined,
  };
}

export function updateInterviewStateWithToolResult(
  state: InterviewSessionState | undefined,
  toolMsg: AgentMessage,
): InterviewSessionState | undefined {
  if (!state?.planSnapshot || toolMsg.toolName !== "score_interview_answer") return state;

  const toolResult = toolMsg.toolResult as { data?: unknown } | undefined;
  const score = normalizeInterviewScore(toolResult?.data || toolMsg.toolResult);
  if (!score) return state;

  const questionNodeId = state.currentQuestionId || state.questionGraph.at(-1)?.id;
  const node = questionNodeId ? state.questionGraph.find((item) => item.id === questionNodeId) : undefined;
  const answerTurnIds = node?.answerTurnIds?.length
    ? node.answerTurnIds
    : state.transcript.filter((turn) => turn.role === "user").slice(-1).map((turn) => turn.id);
  const artifact: InterviewScoreArtifact = {
    id: makeId("score"),
    questionNodeId,
    answerTurnIds,
    score,
    sourceTool: toolMsg.toolName,
    createdAt: toolMsg.timestamp || new Date().toISOString(),
  };

  return {
    ...state,
    scoreArtifacts: [...(state.scoreArtifacts || []), artifact],
    questionGraph: state.questionGraph.map((item) =>
      item.id === questionNodeId ? { ...item, score } : item,
    ),
  };
}

export function shouldPersistInterviewRecap(userContent: string): boolean {
  return /复盘|总结|回顾|结束面试|结束模拟|recap|summary/i.test(userContent);
}

const SCORE_DIMENSION_LABELS: Record<string, string> = {
  structure: "结构完整度",
  specificity: "具体程度",
  highlight: "亮点突出",
  timing: "时间控制",
};

function compactText(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function answerTurnsForNode(state: InterviewSessionState, node: InterviewQuestionNode): InterviewTurn[] {
  const ids = new Set(node.answerTurnIds);
  return state.transcript.filter((turn) => turn.role === "user" && ids.has(turn.id));
}

function scoreForNode(state: InterviewSessionState, node: InterviewQuestionNode): InterviewScore | undefined {
  if (node.score) return node.score;
  return [...(state.scoreArtifacts || [])].reverse().find((artifact) => artifact.questionNodeId === node.id)?.score;
}

function summarizeScore(score?: InterviewScore): string | undefined {
  if (!score) return undefined;
  const dimensions = score.dimensions || {};
  const lows = Object.entries(dimensions)
    .filter(([, value]) => typeof value === "number" && value < 3.5)
    .map(([key]) => SCORE_DIMENSION_LABELS[key] || key);
  if (score.feedback) return score.feedback;
  if (lows.length) return `需要提升：${lows.join("、")}。`;
  return `本题结构化评分 ${score.overall}/5。`;
}

function average(values: number[]): number | undefined {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return undefined;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
}

function dimensionAverages(scores: InterviewScore[]): Record<string, number> {
  const buckets = new Map<string, number[]>();
  for (const score of scores) {
    for (const [key, value] of Object.entries(score.dimensions || {})) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      buckets.set(key, [...(buckets.get(key) || []), value]);
    }
  }
  return Object.fromEntries([...buckets.entries()].map(([key, values]) => [key, average(values) || 0]));
}

export function buildInterviewRecapFromState(
  state: InterviewSessionState,
  rawText?: string,
): InterviewRecap {
  const answeredQuestions = state.questionGraph.filter((node) => node.answerTurnIds.length > 0);
  const questionScores = state.questionGraph
    .map((node) => scoreForNode(state, node))
    .filter((score): score is InterviewScore => Boolean(score));
  const averageScore = average(questionScores.map((score) => score.overall));
  const dimensionScores = dimensionAverages(questionScores);
  const highDimensions = Object.entries(dimensionScores)
    .filter(([, value]) => value >= 4)
    .map(([key]) => SCORE_DIMENSION_LABELS[key] || key);
  const lowDimensions = Object.entries(dimensionScores)
    .filter(([, value]) => value > 0 && value < 3.5)
    .map(([key]) => SCORE_DIMENSION_LABELS[key] || key);
  const mainAnswered = answeredQuestions.filter((node) => node.kind === "main").length;
  const followUpAnswered = answeredQuestions.filter((node) => node.kind === "follow_up" || node.kind === "probe").length;
  const company = state.planSnapshot.jdSnapshot?.company || "目标公司";
  const role = state.planSnapshot.jdSnapshot?.role || "目标岗位";
  const scoredWeakQuestions = state.questionGraph
    .map((node, index) => ({ node, index, score: scoreForNode(state, node) }))
    .filter((item): item is { node: InterviewQuestionNode; index: number; score: InterviewScore } => Boolean(item.score))
    .filter((item) => item.score.overall < 3.5);
  const scoredStrongQuestions = state.questionGraph
    .map((node, index) => ({ node, index, score: scoreForNode(state, node) }))
    .filter((item): item is { node: InterviewQuestionNode; index: number; score: InterviewScore } => Boolean(item.score))
    .filter((item) => item.score.overall >= 4);

  const strengths = [
    highDimensions.length ? `高分维度：${highDimensions.join("、")}。` : "",
    ...scoredStrongQuestions.slice(0, 2).map((item) =>
      `第 ${item.index + 1} 题表现较强（${item.score.overall}/5）：${compactText(item.node.question, 48)}`
    ),
    !questionScores.length && answeredQuestions.length
      ? `已完成 ${answeredQuestions.length} 轮回答，可继续补充结构化评分来沉淀强项。`
      : "",
  ].filter(Boolean);

  const weaknesses = [
    lowDimensions.length ? `待提升维度：${lowDimensions.join("、")}。` : "",
    ...scoredWeakQuestions.slice(0, 2).map((item) =>
      `第 ${item.index + 1} 题得分偏低（${item.score.overall}/5）：${compactText(item.node.question, 48)}`
    ),
    !questionScores.length && answeredQuestions.length
      ? "本轮已有回答但缺少结构化评分，复盘深度会受限。"
      : "",
    answeredQuestions.length === 0 ? "尚未沉淀可复盘的用户回答。" : "",
  ].filter(Boolean);

  const derivedNextPracticePlan = [
    lowDimensions.includes("具体程度") ? "下一轮回答每题至少补 1 个量化结果或业务影响。" : "",
    lowDimensions.includes("结构完整度") ? "用 STAR/项目复盘结构重答得分最低的一题。" : "",
    lowDimensions.includes("亮点突出") ? "提前准备 2 个能体现个人贡献的高光案例。" : "",
    lowDimensions.includes("时间控制") ? "把核心回答压缩到 90-120 秒，再保留 1 个可展开细节。" : "",
    !questionScores.length && answeredQuestions.length ? "先对最近 1-2 个回答做结构化评分，再生成更精确的提升计划。" : "",
    answeredQuestions.length === 0 ? "先完成至少 1 道主问题回答，再生成复盘。" : "",
  ].filter(Boolean).slice(0, 4);
  const nextPracticePlan = derivedNextPracticePlan.length
    ? derivedNextPracticePlan
    : ["选择最贴近 JD 的一道题做二次回答，并补充业务结果、个人贡献和可量化指标。"];

  return {
    generatedAt: new Date().toISOString(),
    overallVerdict: averageScore
      ? `${company} ${role} 模拟面试已完成 ${answeredQuestions.length} 道已回答问题（主问题 ${mainAnswered}，追问/探针 ${followUpAnswered}），平均评分 ${averageScore}/5。`
      : `${company} ${role} 模拟面试已记录 ${answeredQuestions.length} 道已回答问题，尚未生成结构化评分。`,
    strengths,
    weaknesses,
    nextPracticePlan,
    questionFeedback: state.questionGraph.map((node) => {
      const answers = answerTurnsForNode(state, node);
      const score = scoreForNode(state, node);
      const parent = node.parentId ? state.questionGraph.find((item) => item.id === node.parentId) : undefined;
      return {
        questionNodeId: node.id,
        question: node.question,
        kind: node.kind,
        parentQuestion: parent?.question,
        answerExcerpt: compactText(answers.map((turn) => turn.content).join("\n"), 160),
        sourceTurnIds: answers.map((turn) => turn.id),
        score: score?.overall,
        feedback: summarizeScore(score),
      };
    }),
    sourceTurnIds: state.transcript.map((turn) => turn.id),
    rawText,
  };
}

export function persistInterviewRecap(
  state: InterviewSessionState | undefined,
  rawText?: string,
): InterviewSessionState | undefined {
  if (!state?.planSnapshot) return state;
  return {
    ...state,
    recap: buildInterviewRecapFromState(state, rawText),
  };
}

export function recordInterviewRebind(
  state: InterviewSessionState | undefined,
  input: {
    to: { jdId?: number; resumeId?: string };
    reason: string;
    createdAt?: string;
  },
): InterviewSessionState | undefined {
  if (!state?.planSnapshot) return state;
  const event: InterviewRebindEvent = {
    from: {
      jdId: state.planSnapshot.source.jdId,
      resumeId: state.planSnapshot.source.resumeId,
    },
    to: input.to,
    reason: input.reason,
    createdAt: input.createdAt || new Date().toISOString(),
  };
  return {
    ...state,
    rebindHistory: [...(state.rebindHistory || []), event],
  };
}
