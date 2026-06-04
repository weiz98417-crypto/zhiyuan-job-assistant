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

export function buildInterviewRecapFromState(
  state: InterviewSessionState,
  rawText?: string,
): InterviewRecap {
  const answeredQuestions = state.questionGraph.filter((node) => node.answerTurnIds.length > 0);
  const scores = (state.scoreArtifacts || []).map((item) => item.score.overall).filter(Number.isFinite);
  const average = scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : undefined;

  return {
    generatedAt: new Date().toISOString(),
    overallVerdict: average
      ? `已完成 ${answeredQuestions.length} 道题，平均评分 ${average}/5。`
      : `已完成 ${answeredQuestions.length} 道题，尚未生成结构化评分。`,
    strengths: [],
    weaknesses: [],
    nextPracticePlan: [],
    questionFeedback: state.questionGraph.map((node) => ({
      questionNodeId: node.id,
      question: node.question,
      score: node.score?.overall,
      feedback: node.score?.feedback,
    })),
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
