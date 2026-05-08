import type { ToolDefinition, ToolResult } from "../types";

async function handler(): Promise<ToolResult> {
  try {
    const res = await fetch("/api/data/applications?limit=10");
    const json = await res.json();
    return { success: json.success, data: json.data, error: json.error };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}` };
  }
}
function formatResult(result: ToolResult): string {
  const count = Array.isArray(result.data) ? result.data.length : 0;
  return `找到 ${count} 条活动记录。`;
}
export const getRecentActivity: ToolDefinition = {
  name: "get_recent_activity", description: "获取最近的投递活动",
  parameters: {}, category: "query", handler, formatResult,
};
