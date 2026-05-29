import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { jdText, language, targetRole } = params;
  try {
    const res = await fetch("/api/cv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jdText,
        language: language || "zh",
        targetRole,
      }),
    });
    const json = await res.json();
    return { success: json.success, data: json.data, error: json.error };
  } catch {
    return { success: false, data: null, error: "CV 生成请求失败" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `CV 生成失败: ${result.error}`;
  const d = result.data as { fileName?: string; length?: number } | null;
  return d ? `CV 已生成: ${d.fileName} (${d.length} 字符)` : "CV 已生成";
}

export const generateCV: ToolDefinition = {
  name: "generate_cv",
  description: "根据 JD 和用户画像生成定制化简历",
  parameters: {
    jdText: { type: "string", required: true, description: "JD 文本内容" },
    language: { type: "string", required: false, description: "语言: zh/en，默认 zh" },
    targetRole: { type: "string", required: false, description: "目标岗位（可选，从 JD 提取）" },
    referenceIds: { type: "array", required: false, description: "参考简历 ID 列表，用于风格对齐" },
  },
  category: "action",
  handler,
  formatResult,
};
