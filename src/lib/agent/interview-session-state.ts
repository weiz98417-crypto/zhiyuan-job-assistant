import type {
  AgentMessage,
  ChatSession,
  InterviewPlanSnapshot,
  InterviewQuestionKind,
  InterviewQuestionNode,
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

function inferQuestionKind(content: string, state: InterviewSessionState): InterviewQuestionKind {
  const text = content.trim();
  const hasQuestion = /[?？]\s*$/.test(text) || /请|能否|可以|怎么|为什么|举例|展开|介绍/.test(text);
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

  const assistantText = assistantMsg.content.trim();
  const looksLikeQuestion = assistantText && (/[?？]/.test(assistantText) || /第\s*\d+\s*题|追问|请你/.test(assistantText));
  let nodeId = next.currentQuestionId;

  if (looksLikeQuestion) {
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

