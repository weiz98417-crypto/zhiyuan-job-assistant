/**
 * Interview Simulation Engine — session state machine.
 *
 * Phase flow: intro → tech(3题) → behavioral(2题) → reverse → summary
 *
 * Each question: ask → (followup?) → score → next
 */

export type InterviewPhase = "intro" | "tech" | "behavioral" | "reverse" | "summary" | "done";
export type InterviewControl = "pause" | "resume" | "skip" | "finish" | "cancel" | "help" | "format";

export function classifyInterviewControl(content: string): InterviewControl | undefined {
  const text = content.trim().toLowerCase().replace(/[\s，,。.!！?？：:]+/g, "");
  if (/^(?:请|帮我|先)?(?:暂停|暂停一下|暂停面试|暂停模拟面试|停止出题|pause)(?:先到这里|稍后继续|不要继续出题)?$/.test(text)) return "pause";
  if (/^(?:请|帮我)?(?:恢复|恢复面试|继续|继续面试|继续模拟面试|开始面试|开始模拟面试|resume|continue)$/.test(text)) return "resume";
  if (/^(?:请|帮我)?(?:跳过|跳过这题|跳过这一题|下一题|下一个|换一题|skip|next)$/.test(text)) return "skip";
  if (/^(?:请|帮我)?(?:结束|结束面试|结束模拟面试|结束模拟|复盘|总结|做个复盘|面试复盘|finish|recap|summary)$/.test(text)) return "finish";
  if (/^(?:请|帮我)?(?:取消|取消面试|取消模拟面试|放弃面试|cancel)$/.test(text)) return "cancel";
  if (/^(?:请|帮我)?(?:提示|给个提示|给我提示|示范|给个示范|给我示范|给个示例|给我示例|给个示范答案|换个问法|换问法|那你给|你给|hint|help)$/.test(text)) return "help";
  if (/^(?:以后|接下来|后面|请)?(?:只问问题|只问一题|只出一道题|格式短一点|格式简短一点|不要解释|不要这些格式|问题简短一点)$/.test(text)) return "format";
  return undefined;
}

export interface InterviewQuestion {
  id: string;
  phase: InterviewPhase;
  text: string;
  type: "tech" | "behavioral" | "reverse";
  createdAt?: string;
}

export interface InterviewAnswer {
  questionId: string;
  question: string;
  answer: string;
  score?: number;
  feedback?: string;
  followups: { question: string; answer: string }[];
  answerTurnId?: string;
  primaryAnswer?: string;
  createdAt?: string;
  /** Spec 30 / WP1：rubric 细节（来自 scoreSessionAnswer 的 rubric 透传）——复盘页档位/证据/三态渲染源。 */
  rubric?: {
    bands: Record<string, number>;
    overallBand: number;
    evidence: Record<string, string>;
    states: Record<string, string>;
    review: { effectiveEvidence: string; mainGaps: string; stateVerdict: string; betterStructure: string };
  };
}

export interface InterviewSession {
  id: string;
  company: string;
  role: string;
  sourceBinding?: {
    jdId?: number;
    reportNum?: number;
    resumeId?: number | string;
    resumeTitle?: string;
    jdText?: string;
    cvText?: string;
    memoryContext?: string;
  };
  phase: InterviewPhase;
  questionIndex: number;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  currentQuestion?: InterviewQuestion;
  currentFollowups: string[];
  status?: "active" | "paused" | "completed" | "abandoned";
  createdAt?: string;
  snapshotId?: string;
  mode?: string;
  difficulty?: "normal" | "hard" | "pressure" | "junior" | "mid" | "senior" | "staff";
  focus?: string;
  focusAreas?: string[];
  allowFollowUps?: boolean;
}

const PHASE_ORDER: InterviewPhase[] = ["intro", "tech", "behavioral", "reverse"];
const PHASE_QUESTION_COUNTS: Record<string, number> = { intro: 1, tech: 3, behavioral: 2, reverse: 3, summary: 0 };

/** Create a new interview session */
export function createSession(company: string, role: string, sourceBinding?: InterviewSession["sourceBinding"]): InterviewSession {
  return {
    id: `iv_${globalThis.crypto.randomUUID()}`,
    company,
    role,
    sourceBinding,
    phase: "intro",
    questionIndex: 0,
    questions: [],
    answers: [],
    currentFollowups: [],
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

/** Determine next action based on current state */
export function nextAction(
  session: InterviewSession,
  lastAnswer?: string,
): "ask" | "followup" | "score" | "next" | "done" {
  if (session.phase === "done") return "done";

  if (!session.currentQuestion) return "ask";

  // If user just answered and answer is short, suggest followup
  if (lastAnswer) {
    const trimmed = lastAnswer.trim();
    if (trimmed.length < 50) return "followup";
    // If we haven't done a followup yet for this question
    if (session.currentFollowups.length === 0 && session.phase !== "reverse") {
      return "followup";
    }
    return "score";
  }

  return "ask";
}

/** Advance to next phase/question */
export function advance(session: InterviewSession): InterviewSession {
  if (session.phase === "done") return session;
  const currentPhaseIdx = PHASE_ORDER.indexOf(session.phase);

  // Check if more questions in current phase
  const phaseCount = PHASE_QUESTION_COUNTS[session.phase] || 1;
  session.currentFollowups = [];
  session.currentQuestion = undefined;
  if (session.questionIndex + 1 < phaseCount) {
    session.questionIndex++;
    return session;
  }

  // Move to next phase
  const nextPhaseIdx = currentPhaseIdx + 1;
  if (nextPhaseIdx >= PHASE_ORDER.length) {
    session.phase = "done";
    session.status = "completed";
  } else {
    session.phase = PHASE_ORDER[nextPhaseIdx];
    session.questionIndex = 0;
  }

  session.currentFollowups = [];
  session.currentQuestion = undefined;
  return session;
}

/** Check if answer needs a follow-up question (LLM-driven) */
export function shouldFollowUp(answer: string): boolean {
  return answer.trim().length < 50;
}

/** Get phase description for prompt context */
export function getPhasePrompt(session: InterviewSession): string {
  switch (session.phase) {
    case "intro": return "自我介绍环节——让候选人用1-2分钟介绍自己";
    case "tech": return `技术面第${session.questionIndex + 1}题——考察${session.role}的专业能力`;
    case "behavioral": return `行为面第${session.questionIndex + 1}题——考察沟通、协作、解决问题能力`;
    case "reverse": return "反问环节——候选人可以问面试官关于公司/团队/岗位的问题";
    case "summary": return "面试总结——综合评估候选人的表现，给出分数和建议";
    default: return "";
  }
}
