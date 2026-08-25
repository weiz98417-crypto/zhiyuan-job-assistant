import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import {
  analyzePipelineHealth,
  type PipelineHealthInput,
  type PipelineHealthThresholds,
} from "@/lib/server/pipeline-health-service";

async function handler(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  if (!params.pipeline || typeof params.pipeline !== "object") {
    return { success: false, data: null, error: "缺少 Pipeline 数据", errorCategory: "permanent" };
  }
  try {
    const result = await analyzePipelineHealth(
      params.pipeline as PipelineHealthInput,
      params.thresholds as Partial<PipelineHealthThresholds> | undefined,
      context?.signal,
    );
    return {
      success: true,
      data: result,
      errorCategory: "ok",
      llmSummary: `Pipeline 健康状态 ${result.status}，评分 ${result.score}，发现 ${result.issues.length} 个问题。`,
      rawData: result,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "健康检查失败",
      errorCategory: "transient",
      recoverable: true,
    };
  }
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
