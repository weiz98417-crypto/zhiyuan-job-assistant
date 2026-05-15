import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const pipeline = params.pipeline;
  const res = await fetch("/api/analytics/health-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pipeline, thresholds: params.thresholds }),
  });
  const json = await res.json();
  return { success: json.success, data: json.data, error: json.error };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `健康检查失败: ${result.error}`;
  const d = result.data as { status?: string; score?: number; issues?: string[] } | null;
  return d ? `Pipeline 健康: ${d.status} (${d.score}分)，${d.issues?.length || 0} 个问题` : "健康检查完成";
}

export const checkHealth: ToolDefinition = {
  name: "check_health",
  description: "【已废弃】请使用 check_pipeline_health（无需传参，直接从数据库读取）。此工具仍然可用但需要手动传入 pipeline 数据。",
  parameters: {
    pipeline: { type: "object", required: true, description: "Pipeline 数据 { applications: [...] }" },
    thresholds: { type: "object", required: false, description: "告警阈值 { evalWarningPct, evalDangerPct, zeroReplyCount, staleDays }" },
  },
  category: "action",
  handler,
  formatResult,
};
