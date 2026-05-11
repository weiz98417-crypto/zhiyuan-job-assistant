import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { status, company, limit: rawLimit } = params;
  const sp = new URLSearchParams();
  if (typeof status === "string") sp.set("status", status);
  if (typeof company === "string") sp.set("company", company);
  if (typeof rawLimit === "number") sp.set("limit", String(rawLimit));
  try {
    const res = await fetch(`/api/data/applications?${sp.toString()}`);
    const json = await res.json();
    return { success: json.success, data: json.data, error: json.error };
  } catch (err) {
    return { success: false, data: null, error: `请求失败: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `查询失败: ${result.error}`;
  const count = Array.isArray(result.data) ? result.data.length : 0;
  return `找到 ${count} 条投递记录。`;
}

export const searchApplications: ToolDefinition = {
  name: "search_applications",
  description: "搜索用户的投递记录，可按状态和公司名筛选",
  parameters: {
    status: { type: "string", required: false, description: "投递状态" },
    company: { type: "string", required: false, description: "公司名（模糊匹配）" },
    limit: { type: "number", required: false, description: "返回数量上限，默认 20" },
  },
  category: "query",
  handler,
  formatResult,
};
