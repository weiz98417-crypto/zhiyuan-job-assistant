import type { ToolDefinition, ToolResult } from "../types";
import { fetchAgentMemoryContext } from "../memory-helpers";

interface SkillGapParams {
  jd_text?: string;
  cv_text?: string;
  reportNum?: number;
}

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { jd_text, cv_text, reportNum } = params as SkillGapParams;

  let effectiveJdText = jd_text || "";
  if (!effectiveJdText && reportNum) {
    try {
      const reportRes = await fetch(apiPath(`/api/data/reports/${reportNum}`));
      const reportJson = await reportRes.json();
      if (reportJson.success && reportJson.data) {
        const blocks = typeof reportJson.data.blocks_json === "string"
          ? JSON.parse(reportJson.data.blocks_json)
          : (reportJson.data.blocks_json || {});
        const blockA = blocks.a?.content || blocks.a || "";
        effectiveJdText = [reportJson.data.role, reportJson.data.company, blockA].filter(Boolean).join(" - ");
      }
    } catch {
      /* fall through to validation */
    }
  }

  if (!effectiveJdText || effectiveJdText.trim().length < 50) {
    return {
      success: false,
      data: null,
      error: "JD 文本不足 50 字符。可传入 jd_text 参数，或传 reportNum 从已评估报告获取。",
      errorCategory: "need_user_input",
    };
  }

  let cv = cv_text || "";
  if (!cv && typeof localStorage !== "undefined") {
    try {
      const cvRaw = localStorage.getItem("zhiyuan-cv");
      if (cvRaw) cv = extractCVText(JSON.parse(cvRaw));
    } catch {
      /* use API fallback */
    }
  }

  if (!cv) {
    try {
      const cvRes = await fetch(apiPath("/api/cv/data"));
      const cvJson = await cvRes.json();
      if (cvJson.success && cvJson.data) cv = extractCVText(cvJson.data);
    } catch {
      /* use empty cv */
    }
  }

  if (!cv || cv.trim().length < 20) {
    return {
      success: false,
      data: null,
      error: "CV 信息不完整，建议先完善简历，特别是技能和工作经历栏目。",
      errorCategory: "need_user_input",
    };
  }

  const memoryContext = await fetchAgentMemoryContext({
    task: "resume_optimization",
    agentId: "resume",
    query: `${effectiveJdText.slice(0, 900)}\n${cv.slice(0, 900)}`,
    budgetChars: 900,
    semanticTopK: 4,
  });

  return {
    success: true,
    data: { jd_text: effectiveJdText, cv_text: cv, memoryContext },
    rawData: { jd_text: effectiveJdText, cv_text: cv, memoryContext },
    llmSummary: buildSkillGapPrompt(effectiveJdText, cv, memoryContext?.llmSummary || ""),
    errorCategory: "ok",
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `技能缺口分析失败: ${result.error}`;
  return result.llmSummary || "请对比 CV 和 JD，输出技能缺口分析。";
}

function buildSkillGapPrompt(jdText: string, cvText: string, memorySummary: string): string {
  return `## 技能缺口分析
请对比以下 CV、JD 和长期记忆上下文，找出用户缺失的关键技能。

CV 摘要：
${cvText.slice(0, 1800)}

JD 摘要：
${jdText.slice(0, 1800)}

${memorySummary ? `长期记忆上下文：\n${memorySummary}\n\n` : ""}请输出：
1. 缺失技能：JD 要求但 CV/长期记忆中缺少的能力，按优先级排序。
2. 薄弱项：有证据但深度不足的能力。
3. 匹配项：CV、JD、长期记忆共同覆盖的能力。
4. 学习建议：高优先级缺口的具体补强路径。`;
}

function extractCVText(cvData: Record<string, unknown>): string {
  const activeVersion = String(cvData.activeVersion || "");
  const versions = cvData.versions as Record<string, { sections?: Array<{ title: string; content?: string }> }> | undefined;
  const sections = versions?.[activeVersion]?.sections || Object.values(versions || {})[0]?.sections || [];
  return sections
    .filter((section) => section.content?.trim())
    .map((section) => `${section.title}: ${section.content}`)
    .join("\n");
}

export const detectSkillGaps: ToolDefinition = {
  name: "detect_skill_gaps",
  description: "对比用户 CV 和目标 JD 的技能要求，结合长期记忆识别缺失技能、薄弱项、匹配项，并给出优先级和学习建议。",
  parameters: {
    jd_text: { type: "string", required: false, description: "目标 JD 完整文本，与 reportNum 二选一。" },
    reportNum: { type: "number", required: false, description: "已评估报告编号，自动从中获取 JD 文本，与 jd_text 二选一。" },
    cv_text: { type: "string", required: false, description: "用户 CV 文本，可选；不提供时自动读取。" },
  },
  category: "query",
  handler,
  formatResult,
};
