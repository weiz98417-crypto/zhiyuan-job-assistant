import type { ToolDefinition, ToolResult } from "../types";

interface SkillGapParams {
  jd_text?: string;
  cv_text?: string;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { jd_text, cv_text } = params as SkillGapParams;

  if (!jd_text || jd_text.trim().length < 50) {
    return { success: false, data: null, error: "JD 文本不足 50 字符" };
  }

  // Get CV text if not provided
  let cv = cv_text || "";
  if (!cv) {
    try {
      const cvRaw = localStorage.getItem("zhiyuan-cv");
      if (cvRaw) {
        const parsed = JSON.parse(cvRaw);
        if (parsed?.activeVersion && parsed?.versions?.[parsed.activeVersion]?.sections) {
          cv = parsed.versions[parsed.activeVersion].sections
            .filter((s: { content?: string }) => s.content?.trim())
            .map((s: { title: string; content: string }) => `${s.title}: ${s.content}`)
            .join("\n");
        }
      }
    } catch { /* use empty cv */ }
  }

  if (!cv || cv.trim().length < 20) {
    return { success: false, data: null, error: "CV 信息不完整，建议先完善简历（特别是技能和工作经历栏位）" };
  }

  return {
    success: true,
    data: { jd_text, cv_text: cv },
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `技能缺口分析失败: ${result.error}`;

  return `## 🔍 技能缺口分析

请对比以下 CV 和 JD，找出用户缺失的关键技能：

**用户 CV 技能：** 从简历中提取
**JD 要求：** 从职位描述中提取

请输出：
1. **缺失技能** — JD 要求但 CV 中未提及的技能（按优先级排序）
2. **薄弱项** — CV 中提到但不深入、JD 重点要求的技能
3. **匹配项** — CV 和 JD 都覆盖的技能
4. **学习建议** — 对高优先级缺口给出具体的学习路径`;
}

export const detectSkillGaps: ToolDefinition = {
  name: "detect_skill_gaps",
  description: "对比用户 CV 和目标 JD 的技能要求，识别缺失技能和薄弱项，给出优先级和学习建议。当用户问'我缺什么技能''还需要学什么''能不能投这个岗位'时调用此工具。",
  parameters: {
    jd_text: { type: "string", required: true, description: "目标 JD 完整文本" },
    cv_text: { type: "string", required: false, description: "用户 CV 文本（可选，不提供时自动读取）" },
  },
  category: "query",
  handler,
  formatResult,
};
