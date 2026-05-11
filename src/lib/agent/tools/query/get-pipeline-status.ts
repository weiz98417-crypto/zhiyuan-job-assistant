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
  const d = result.data as { total?: number } | null;
  return `Pipeline: ${d?.total || 0} 条记录`;
}
export const getPipelineStatus: ToolDefinition = {
  name: "get_pipeline_status", description: "获取Pipeline总体状态（投递统计）",
  parameters: {}, category: "query", handler, formatResult,
};
