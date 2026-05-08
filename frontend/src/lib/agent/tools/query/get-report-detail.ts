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
  const d = result.data as { company?: string } | null;
  return result.success ? `报告: ${d?.company || ""}` : `查询失败: ${result.error}`;
}
export const getReportDetail: ToolDefinition = {
  name: "get_report_detail", description: "获取评估报告详情",
  parameters: { reportNum: { type: "number", required: true, description: "报告编号" } },
  category: "query", handler, formatResult,
};
