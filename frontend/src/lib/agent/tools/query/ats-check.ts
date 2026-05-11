import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const cvText = params.cv_text as string;
  if (!cvText) return { success: false, data: null, error: "请提供 CV 文本" };

  const res = await fetch("/api/cv/ats-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cvText }),
  });
  if (!res.ok) return { success: false, data: null, error: `ATS检查失败: ${res.status}` };
  const json = await res.json();
  return { success: true, data: json.data };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `ATS 检查失败: ${result.error}`;
  const d = result.data as { issues?: Array<{ dimension: string; severity: string; detail: string; fix: string }>; score?: number };
  const issues = d.issues || [];
  if (!issues.length) return `✅ ATS 兼容性: ${d.score || 100}/100 — 未发现问题`;

  const sevEmoji: Record<string, string> = { critical: "🔴", warning: "🟡", info: "⚪" };
  const rows = issues.map((i) => `| ${sevEmoji[i.severity] || "⚪"} | ${i.dimension} | ${i.detail} | ${i.fix} |`).join("\n");

  return `## 📋 ATS 兼容性检查\n\n**得分: ${d.score || 0}/100**\n\n| | 维度 | 问题 | 修复建议 |\n|---|------|------|---------|\n${rows}`;
}

export const checkATS: ToolDefinition = {
  name: "check_ats_compatibility",
  description: "检查简历的 ATS（求职者追踪系统）兼容性：联系方式完整性、量化数据密度、关键词覆盖、section 完整性、格式问题。当用户问'简历能过ATS吗''简历会被机器筛掉吗'时调用此工具。",
  parameters: {
    cv_text: { type: "string", required: true, description: "完整 CV 文本" },
  },
  category: "query",
  handler,
  formatResult,
};
