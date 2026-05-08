import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { offerText, language } = params;
  if (typeof offerText !== "string" || offerText.length < 30) {
    return { success: false, data: null, error: "offerText must be a string with ≥30 chars" };
  }
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerText, language: language || "zh" }),
  });
  const json = await res.json();
  return { success: json.success, data: json.data, error: json.error };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `Offer 评估失败: ${result.error}`;
  const d = result.data as { company?: string; role?: string; overallScore?: number } | null;
  return d ? `Offer 评估完成: ${d.company} ${d.role}，总分 ${d.overallScore}/5` : "评估完成";
}

export const evaluateOffer: ToolDefinition = {
  name: "evaluate_offer",
  description: "评估一个录取 offer，从薪资、福利、成长性等维度分析",
  parameters: {
    offerText: { type: "string", required: true, description: "Offer 文本内容，至少 30 字符" },
    language: { type: "string", required: false, description: "语言: zh/en，默认 zh" },
  },
  category: "action",
  handler,
  formatResult,
};
