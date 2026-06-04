import type { ToolDefinition, ToolResult } from "./types";
import type { InterviewQuestion, AnswerScore, CoachMode } from "@/types";
import { COACH_MODES } from "@/types";
import { fetchAgentMemoryContext, writeCandidateAgentMemory } from "./memory-helpers";

async function generateHandler(params: Record<string, unknown>): Promise<ToolResult> {
  const jdText = String(params.jdText || "");
  const cvText = String(params.cvText || "");
  const company = String(params.company || "");
  const role = String(params.role || "");
  const mode = (params.mode || "behavioral") as CoachMode;
  const requestedCount = Number(params.count) || 1;
  const count = Math.max(1, Math.min(requestedCount, 1));

  try {
    const memoryContext = await fetchAgentMemoryContext({
      task: "interview",
      query: `${company} ${role}\n${jdText.slice(0, 900)}\n${cvText.slice(0, 900)}`,
      budgetChars: 1100,
      semanticTopK: 5,
    });
    const cvTextWithMemory = [
      cvText,
      memoryContext?.llmSummary ? `Long-term memory context:\n${memoryContext.llmSummary}` : "",
    ].filter(Boolean).join("\n\n");

    const res = await fetch("/api/agent/coach/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jdText,
        cvText: cvTextWithMemory,
        company,
        role,
        mode,
        count,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, data: null, error: err.error || `出题失败 (${res.status})` };
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      return { success: false, data: null, error: json.error || "出题返回为空" };
    }

    const generatedQuestions = json.data.questions as InterviewQuestion[];
    const questions = generatedQuestions.slice(0, 1);
    return {
      success: true,
      data: { questions, company, role, mode, count: questions.length, memoryContext },
      llmSummary: `已生成 ${questions.length} 道面试题，面向 ${company || "目标公司"} ${role || "目标岗位"}。真实模拟模式每轮只展示 1 道题，并等待用户回答。`,
      uiPayload: { type: "interview_questions", questions, company, role, mode, memoryContext },
    };
  } catch (err) {
    return { success: false, data: null, error: `出题失败: ${err instanceof Error ? err.message : "未知错误"}` };
  }
}

function generateFormat(result: ToolResult): string {
  if (!result.success) return `出题失败: ${result.error}`;
  const d = result.data as { questions?: InterviewQuestion[]; company?: string; role?: string; count?: number } | null;
  if (!d?.questions?.length) return "未生成题目";

  const catLabel: Record<string, string> = {
    behavioral: "行为面试",
    technical: "技术/专业",
    "case-study": "案例分析",
    culture: "文化匹配",
  };
  const items = d.questions.map((q, i) => {
    const cat = catLabel[q.category] || q.category;
    return `  ${i + 1}. [${cat}] ${q.question}\n     出题依据: ${q.context.slice(0, 80)}\n     准备方向: ${q.storyHint.slice(0, 80)}${q.weaknessNote ? "\n     注意: " + q.weaknessNote : ""}`;
  });

  return `${d.company || ""} ${d.role || ""}（${d.count || items.length} 道）\n\n${items.join("\n\n")}`;
}

async function scoreHandler(params: Record<string, unknown>): Promise<ToolResult> {
  const question = String(params.question || "");
  const answer = String(params.answer || "");
  const mode = (params.mode || "behavioral") as CoachMode;
  const context = String(params.context || "");

  if (!question || !answer) {
    return { success: false, data: null, error: "请提供题目 question 和回答 answer" };
  }

  try {
    const memoryContext = await fetchAgentMemoryContext({
      task: "interview",
      query: `${question}\n${answer}\n${context}`,
      budgetChars: 800,
      semanticTopK: 4,
    });
    const contextWithMemory = [
      context,
      memoryContext?.llmSummary ? `Long-term memory context:\n${memoryContext.llmSummary}` : "",
    ].filter(Boolean).join("\n\n");

    const res = await fetch("/api/agent/coach/score-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        answer,
        mode,
        context: contextWithMemory,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, data: null, error: err.error || `评分失败 (${res.status})` };
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      return { success: false, data: null, error: json.error || "评分返回为空" };
    }

    const score = json.data as AnswerScore;
    await writeCandidateAgentMemory({
      memoryType: "interview_observation",
      canonicalText: `Interview answer scored ${score.overall || 0}/5 for question: ${question.slice(0, 120)}.`,
      sourceType: "interview_answer",
      sourceId: Date.now(),
      quote: answer.slice(0, 800),
      confidence: 0.6,
      importance: score.overall < 3 ? 0.75 : 0.55,
      extractionMethod: "interview_answer_score",
      metadata: { question, mode, suggestions: score.suggestions || [] },
    });

    return { success: true, data: { ...score, memoryContext } };
  } catch (err) {
    return { success: false, data: null, error: `评分失败: ${err instanceof Error ? err.message : "未知错误"}` };
  }
}

function scoreFormat(result: ToolResult): string {
  if (!result.success) return `评分失败: ${result.error}`;
  const d = result.data as AnswerScore | null;
  if (!d) return "评分完成（无数据）";

  const dims = d.dimensions;
  const dimLabels: Record<string, string> = {
    structure: "结构完整度",
    specificity: "具体程度",
    highlight: "亮点突出",
    timing: "时间控制",
  };

  let out = `综合评分: ${d.overall?.toFixed(2) || "N/A"}/5\n\n`;
  out += Object.entries(dims).map(([k, v]) => `  ${dimLabels[k] || k}: ${v}/5`).join("\n");

  if (d.suggestions?.length) {
    out += `\n\n改进建议:\n${d.suggestions.map((s) => `  - ${s}`).join("\n")}`;
  }
  if (d.segmentFeedback?.length) {
    out += `\n\n逐段反馈:\n${d.segmentFeedback.map((seg) => `  ${seg.rating}: ${seg.text}`).join("\n")}`;
  }
  return out;
}

export const generateInterviewQuestions: ToolDefinition = {
  name: "generate_interview_questions",
  description: "根据 JD、简历和面试模式生成下一道面试题。真实模拟必须一次只生成/展示 1 道题，等待用户回答后再继续。",
  parameters: {
    jdText: { type: "string", required: false, description: "JD 正文，有则基于 JD 出题。" },
    cvText: { type: "string", required: false, description: "简历正文，用于个性化出题。" },
    company: { type: "string", required: false, description: "目标公司名称。" },
    role: { type: "string", required: false, description: "目标职位。" },
    mode: { type: "string", required: false, description: `面试模式: ${Object.keys(COACH_MODES).join("|")}` },
    count: { type: "number", required: false, description: "题目数量；真实模拟固定为 1。" },
    difficulty: { type: "string", required: false, description: "难度: easy/medium/hard，默认 medium。" },
    focus_sections: { type: "array", required: false, description: "聚焦板块: behavioral/technical/case/culture，默认全部。" },
  },
  category: "action",
  handler: generateHandler,
  formatResult: generateFormat,
};

export const scoreInterviewAnswer: ToolDefinition = {
  name: "score_interview_answer",
  description: "对用户的面试回答进行四维度评分，并将观察结果作为候选长期记忆写回。",
  parameters: {
    question: { type: "string", required: false, description: "原面试题目。有 active interview session 时可留空，由已持久化的 questionGraph 补全。" },
    answer: { type: "string", required: false, description: "用户的回答文本。有 active interview session 时可留空，由已持久化的 transcript 补全。" },
    mode: { type: "string", required: false, description: "面试模式，影响评分权重。" },
    context: { type: "string", required: false, description: "JD/CV 上下文，可帮助评分更精准。" },
  },
  category: "action",
  handler: scoreHandler,
  formatResult: scoreFormat,
};

export const INTERVIEW_TOOLS: ToolDefinition[] = [
  generateInterviewQuestions,
  scoreInterviewAnswer,
];
