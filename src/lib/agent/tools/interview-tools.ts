import type { ToolDefinition, ToolResult } from "./types";
import type { InterviewQuestion, AnswerScore, CoachMode } from "@/types";
import { COACH_MODES } from "@/types";

/* ── Generate Questions Tool ── */

interface GenerateQuestionsParams {
  jdText?: string;
  cvText?: string;
  company?: string;
  role?: string;
  mode?: CoachMode;
  count?: number;
}

async function generateHandler(params: Record<string, unknown>): Promise<ToolResult> {
  const jdText = String(params.jdText || "");
  const cvText = String(params.cvText || "");
  const company = String(params.company || "");
  const role = String(params.role || "");
  const mode = (params.mode || "behavioral") as CoachMode;
  const count = Number(params.count) || 8;
  try {
    const res = await fetch("/api/agent/coach/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jdText: jdText || "",
        cvText: cvText || "",
        company: company || "",
        role: role || "",
        mode: mode || "behavioral",
        count: count || 8,
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

    const questions = json.data.questions as InterviewQuestion[];
    return { success: true, data: { questions, company, role, mode, count: questions.length } };
  } catch (err) {
    return { success: false, data: null, error: `出题失败: ${err instanceof Error ? err.message : "未知错误"}` };
  }
}

function generateFormat(result: ToolResult): string {
  if (!result.success) return `出题失败: ${result.error}`;
  const d = result.data as { questions?: InterviewQuestion[]; company?: string; role?: string; count?: number } | null;
  if (!d?.questions?.length) return "未生成题目";

  const catLabel: Record<string, string> = { behavioral: "行为面试", technical: "技术/专业", "case-study": "案例分析", culture: "文化匹配" };
  const items = d.questions.map((q, i) => {
    const cat = catLabel[q.category] || q.category;
    return `  ${i + 1}. [${cat}] ${q.question}\n     出处: ${q.context.slice(0, 80)}\n     准备: ${q.storyHint.slice(0, 80)}${q.weaknessNote ? "\n     ⚠️ " + q.weaknessNote : ""}`;
  });

  return `📝 ${d.company || ""} ${d.role || ""}（${d.count || items.length} 道）\n\n${items.join("\n\n")}`;
}

/* ── Score Answer Tool ── */

interface ScoreAnswerParams {
  question: string;
  answer: string;
  mode?: CoachMode;
  context?: string;
}

async function scoreHandler(params: Record<string, unknown>): Promise<ToolResult> {
  const question = String(params.question || "");
  const answer = String(params.answer || "");
  const mode = (params.mode || "behavioral") as CoachMode;
  const context = String(params.context || "");

  if (!question || !answer) {
    return { success: false, data: null, error: "请提供题目 (question) 和回答 (answer)" };
  }

  try {
    const res = await fetch("/api/agent/coach/score-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        answer,
        mode: mode || "behavioral",
        context: context || "",
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

    return { success: true, data: json.data as AnswerScore };
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

  let out = `📊 综合评分: **${d.overall?.toFixed(2) || "N/A"}/5**\n\n`;
  out += Object.entries(dims).map(([k, v]) => `  ${dimLabels[k] || k}: ${"★".repeat(Math.round(v || 0))}${"☆".repeat(5 - Math.round(v || 0))} ${v}/5`).join("\n");

  if (d.suggestions?.length) {
    out += `\n\n💡 改进建议:\n${d.suggestions.map((s) => `  - ${s}`).join("\n")}`;
  }
  if (d.segmentFeedback?.length) {
    out += `\n\n📝 逐段反馈:\n${d.segmentFeedback.map((seg) => `  ${seg.rating === "good" ? "✓" : seg.rating === "expand" ? "↗" : "↘"} ${seg.text}`).join("\n")}`;
  }
  return out;
}

/* ── Tool Definitions ── */

export const generateInterviewQuestions: ToolDefinition = {
  name: "generate_interview_questions",
  description: "根据 JD、简历和面试模式生成面试题目（8-12道），分四类：行为面试、技术专业、案例分析、文化匹配",
  parameters: {
    jdText: { type: "string", required: false, description: "JD 正文（有则基于JD出题）" },
    cvText: { type: "string", required: false, description: "简历正文（用于个性化出题）" },
    company: { type: "string", required: false, description: "目标公司名称" },
    role: { type: "string", required: false, description: "目标职位" },
    mode: { type: "string", required: false, description: `面试模式: ${Object.keys(COACH_MODES).join("|")}` },
    count: { type: "number", required: false, description: "题目数量，默认 8" },
  },
  category: "action",
  handler: generateHandler,
  formatResult: generateFormat,
};

export const scoreInterviewAnswer: ToolDefinition = {
  name: "score_interview_answer",
  description: "对用户的面试回答进行四维度评分（结构完整度/具体程度/亮点突出/时间控制），含逐段反馈和改进建议",
  parameters: {
    question: { type: "string", required: true, description: "原面试题目" },
    answer: { type: "string", required: true, description: "用户的回答文本" },
    mode: { type: "string", required: false, description: "面试模式，影响评分权重" },
    context: { type: "string", required: false, description: "JD/CV 上下文（可帮助评分更精准）" },
  },
  category: "action",
  handler: scoreHandler,
  formatResult: scoreFormat,
};

export const INTERVIEW_TOOLS: ToolDefinition[] = [
  generateInterviewQuestions,
  scoreInterviewAnswer,
];
