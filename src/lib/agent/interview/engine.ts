/**
 * Interview Simulation Engine — session state machine.
 *
 * Phase flow: intro → tech(3题) → behavioral(2题) → reverse → summary
 *
 * Each question: ask → (followup?) → score → next
 */

export type InterviewPhase = "intro" | "tech" | "behavioral" | "reverse" | "summary" | "done";

export interface InterviewQuestion {
  id: string;
  phase: InterviewPhase;
  text: string;
  type: "tech" | "behavioral" | "reverse";
}

export interface InterviewAnswer {
  questionId: string;
  question: string;
  answer: string;
  score?: number;
  feedback?: string;
  followups: { question: string; answer: string }[];
}

export interface InterviewSession {
  id: string;
  company: string;
  role: string;
  sourceBinding?: {
    jdId?: number;
    reportNum?: number;
    resumeId?: number;
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
}

const PHASE_ORDER: InterviewPhase[] = ["intro", "tech", "tech", "tech", "behavioral", "behavioral", "reverse", "summary"];
const PHASE_QUESTION_COUNTS: Record<string, number> = { intro: 1, tech: 3, behavioral: 2, reverse: 3, summary: 0 };

/** Create a new interview session */
export function createSession(company: string, role: string, sourceBinding?: InterviewSession["sourceBinding"]): InterviewSession {
  return {
    id: `iv_${Date.now()}`,
    company,
    role,
    sourceBinding,
    phase: "intro",
    questionIndex: 0,
    questions: [],
    answers: [],
    currentFollowups: [],
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
  const currentPhaseIdx = PHASE_ORDER.indexOf(session.phase);

  // Check if more questions in current phase
  const phaseCount = PHASE_QUESTION_COUNTS[session.phase] || 1;
  if (session.questionIndex + 1 < phaseCount) {
    session.questionIndex++;
    return session;
  }

  // Move to next phase
  const nextPhaseIdx = currentPhaseIdx + 1;
  if (nextPhaseIdx >= PHASE_ORDER.length) {
    session.phase = "done";
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
