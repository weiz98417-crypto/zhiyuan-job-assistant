import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { query, company, days } = params;
  try {
    const res = await fetch("/api/scan/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: typeof query === "string" ? query : undefined,
        company: typeof company === "string" ? company : undefined,
        days: typeof days === "number" ? days : 7,
      }),
    });
    const json = await res.json();
    return { success: json.success, data: json.data, error: json.error };
  } catch {
    return { success: false, data: null, error: "扫描请求失败" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `扫描失败: ${result.error}`;
  const data = result.data as { results?: unknown[]; count?: number } | null;
  const count = data?.count ?? (Array.isArray(data?.results) ? data.results.length : 0);
  return `扫描完成，找到 ${count} 个新职位。`;
}

export const scanPortals: ToolDefinition = {
  name: "scan_portals",
  description: "扫描招聘网站，搜索新发布的职位",
  parameters: {
    query: { type: "string", required: false, description: "搜索关键词" },
    company: { type: "string", required: false, description: "目标公司名" },
    days: { type: "number", required: false, description: "搜索最近 N 天，默认 7" },
    portal: { type: "string", required: false, description: "限定招聘平台，如 boss/lagou/51job" },
    location: { type: "string", required: false, description: "城市/地区过滤" },
    salary_min: { type: "number", required: false, description: "最低薪资过滤（K/月）" },
  },
  category: "action",
  handler,
  formatResult,
};
