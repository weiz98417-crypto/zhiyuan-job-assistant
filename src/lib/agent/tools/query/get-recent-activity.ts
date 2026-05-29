import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const rawLimit = Number(params.limit) || 10;
  const dateFrom = typeof params.date_from === "string" ? params.date_from : "";
  const sp = new URLSearchParams();
  sp.set("limit", String(rawLimit));
  if (dateFrom) sp.set("date_from", dateFrom);
  try {
    const res = await fetch(`/api/data/applications?${sp.toString()}`);
    const json = await res.json();
    return { success: json.success, data: json.data, error: json.error };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}` };
  }
}
function formatResult(result: ToolResult): string {
  if (!result.success) return `查询失败: ${result.error}`;
  const apps = (Array.isArray(result.data) ? result.data : []) as Array<{ company: string; role: string; status: string; date: string }>;
  if (apps.length === 0) return "暂无投递活动。";
  return `最近 ${apps.length} 条活动:\n${apps.map(a => `${a.company}-${a.role} | ${a.status} | ${a.date}`).join("\n")}`;
}
export const getRecentActivity: ToolDefinition = {
  name: "get_recent_activity", description: "获取最近的投递活动。支持自定义数量和日期过滤。",
  parameters: {
    limit: { type: "number", required: false, description: "返回数量，默认 10" },
    date_from: { type: "string", required: false, description: "起始日期 YYYY-MM-DD" },
  },
  category: "query", handler, formatResult,
};
