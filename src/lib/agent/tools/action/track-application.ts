import { trackApplication } from "@/lib/application-workflow";
import type { TrackApplicationInput } from "@/lib/application-workflow";
import type { ErrorCategory, ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

type TrackPayload = {
  created?: boolean;
  updated?: boolean;
  data?: { id?: number; company?: string; role?: string; status?: string };
  event?: { id?: number };
  error?: string;
  errorCategory?: string;
};

function asErrorCategory(value: unknown, fallback: ErrorCategory): ErrorCategory {
  return value === "ok" || value === "transient" || value === "permanent" || value === "need_user_input" ? value : fallback;
}

async function handler(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  try {
    const input = { ...params, source: params.source || "agent_chat" } as TrackApplicationInput;
    const res = context?.principal
      ? undefined
      : await fetch("/api/data/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
    const json = context?.principal
      ? await trackApplication(input, context.principal.userId)
      : await res!.json() as TrackPayload & { success?: boolean };
    if (!json.success) {
      return {
        success: false,
        data: json,
        error: json.error || "加入投递追踪失败",
        errorCategory: asErrorCategory(json.errorCategory, res?.status === 400 ? "need_user_input" : "permanent"),
      };
    }
    const app = json.data || {};
    return {
      success: true,
      data: json,
      errorCategory: "ok",
      llmSummary: `已${json.created ? "加入" : "更新"}投递追踪：${app.company || ""} - ${app.role || ""}，状态 ${app.status || ""}，记录 ID ${app.id || ""}。`,
      uiPayload: { type: "application_tracked", readBackVerified: true, ...json },
      rawData: json,
    };
  } catch (err) {
    return { success: false, data: null, error: `请求失败: ${err instanceof Error ? err.message : "unknown"}`, errorCategory: "transient" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `加入追踪失败: ${result.error}`;
  const payload = result.rawData as TrackPayload | undefined;
  const app = payload?.data || {};
  return `${payload?.created ? "已加入" : "已更新"}投递追踪：${app.company || ""} - ${app.role || ""}（${app.status || ""}），记录 ID ${app.id || "-"}，事件 ID ${payload?.event?.id || "-"}`;
}

export const trackApplicationTool: ToolDefinition = {
  name: "track_application",
  description: "把 JD、评估报告或岗位发现结果加入求职 Pipeline 投递追踪。必须提供公司和岗位名称；写入后返回读回记录和事件证据。",
  matchHints: ["加入追踪", "扔进追踪", "加入 pipeline", "这个岗位我想跟进", "把刚才发现的岗位加入追踪"],
  parameters: {
    company: { type: "string", required: true, description: "公司名称" },
    role: { type: "string", required: true, description: "岗位名称" },
    score: { type: "number", required: false, description: "JD 或报告评分" },
    status: { type: "string", required: false, description: "初始状态，默认 evaluated" },
    reportNum: { type: "number", required: false, description: "关联报告编号" },
    jdId: { type: "number", required: false, description: "关联 JD ID" },
    sourceUrl: { type: "string", required: false, description: "原始 JD 链接" },
    notes: { type: "string", required: false, description: "备注" },
  },
  category: "action",
  handler,
  formatResult,
};
