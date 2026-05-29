import type { ToolDefinition, ToolResult } from "../types";

async function handler(): Promise<ToolResult> {
  try {
    const res = await fetch("/api/data/applications");
    const json = await res.json();
    if (!json.success) return { success: false, data: null, error: json.error };
    const apps = json.data as Array<{ status: string; score: number }>;
    const total = apps.length;
    const byStatus: Record<string, number> = {};
    for (const a of apps) { byStatus[a.status] = (byStatus[a.status] || 0) + 1; }
    const avgScore = total > 0 ? Math.round(apps.reduce((s, a) => s + a.score, 0) / total * 10) / 10 : 0;
    return { success: true, data: { total, byStatus, avgScore } };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}` };
  }
}
function formatResult(result: ToolResult): string {
  if (!result.success) return `查询失败: ${result.error}`;
  const d = result.data as { total?: number; byStatus?: Record<string, number>; avgScore?: number } | null;
  if (!d) return "Pipeline 数据为空";
  const statusLines = d.byStatus ? Object.entries(d.byStatus).map(([k,v]) => `${k}: ${v}`).join(", ") : "";
  return `Pipeline: ${d.total || 0} 条记录 | 均分 ${d.avgScore || "-"}/5${statusLines ? ` | ${statusLines}` : ""}`;
}
export const getPipelineStatus: ToolDefinition = {
  name: "get_pipeline_status", description: "获取 Pipeline 总体投递统计，支持状态和日期过滤",
  parameters: {
    status: { type: "string", required: false, description: "投递状态过滤" },
    date_from: { type: "string", required: false, description: "起始日期 YYYY-MM-DD" },
    date_to: { type: "string", required: false, description: "截止日期 YYYY-MM-DD" },
  }, category: "query", handler, formatResult,
};
