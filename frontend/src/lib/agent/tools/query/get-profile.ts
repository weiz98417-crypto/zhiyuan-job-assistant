import type { ToolDefinition, ToolResult } from "../types";

async function handler(): Promise<ToolResult> {
  try {
    const res = await fetch("/api/data/profile");
    const json = await res.json();
    return { success: json.success, data: json.data, error: json.error };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}` };
  }
}
function formatResult(result: ToolResult): string {
  return result.success ? "画像已获取" : `获取失败: ${result.error}`;
}
export const getProfile: ToolDefinition = {
  name: "get_profile", description: "获取用户求职画像",
  parameters: {}, category: "query", handler, formatResult,
};
