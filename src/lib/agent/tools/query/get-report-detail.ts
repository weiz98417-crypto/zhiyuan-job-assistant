import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const id = params.reportNum || params.reportId;
  try {
    const res = await fetch(`/api/data/reports/${id}`);
    const json = await res.json();
    return { success: json.success, data: json.data, error: json.error };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}` };
  }
}
function formatResult(result: ToolResult): string {
  if (!result.success) return `查询失败: ${result.error}`;
  const d = result.data as Record<string, unknown> | null;
  if (!d) return "报告数据为空";

  const parts: string[] = [];
  parts.push(`# ${d.company || "未知公司"} — ${d.role || "未知岗位"}`);
  parts.push(`**${d.overall_score || "-"}/5** | ${d.archetype || ""} | ${d.date || ""}`);
  parts.push(`报告编号: ${d.report_num || "-"}`);

  try {
    const blocks = typeof d.blocks_json === "string" ? JSON.parse(d.blocks_json) : (d.blocks_json || {});
    const labels: Record<string, string> = {
      a: "A · 职位概览", b: "B · 简历匹配", c: "C · 职级与策略",
      d: "D · 薪资与市场", e: "E · 定制化方案", f: "F · 面试准备", g: "G · 职位合法性",
    };
    for (const key of ["a", "b", "c", "d", "e", "f", "g"]) {
      const block = blocks[key];
      if (!block) continue;
      const content = typeof block === "string" ? block : (block.content || "");
      if (!content.trim()) continue;
      parts.push(`## ${labels[key] || key.toUpperCase()}`);
      parts.push(content);
    }
  } catch { /* ignore */ }

  return parts.join("\n\n") || `报告 #${d.report_num} 内容为空`;
}
export const getReportDetail: ToolDefinition = {
  name: "get_report_detail", description: "获取评估报告详情",
  parameters: { reportNum: { type: "number", required: true, description: "报告编号" } },
  category: "query", handler, formatResult,
};
