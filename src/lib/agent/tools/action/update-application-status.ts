import { updateApplicationStatus } from "@/lib/application-workflow";
import type { UpdateApplicationStatusInput } from "@/lib/application-workflow";
import type { ErrorCategory, ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

type UpdatePayload = {
  ambiguous?: boolean;
  candidates?: unknown[];
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
    const input = { ...params, source: params.source || "agent_chat" } as UpdateApplicationStatusInput;
    const json = context?.principal
      ? await updateApplicationStatus(input, context.principal.userId)
      : await fetch("/api/data/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }).then((res) => res.json()) as UpdatePayload & { success?: boolean };
    if (!json.success) {
      return {
        success: false,
        data: json,
        error: json.error || "更新投递状态失败",
        errorCategory: asErrorCategory(json.errorCategory, json.ambiguous ? "need_user_input" : "permanent"),
        llmSummary: json.ambiguous ? "匹配到多个投递记录，必须让用户选择具体记录，不能擅自更新。" : undefined,
        uiPayload: json,
      };
    }
    const app = json.data || {};
    return {
      success: true,
      data: json,
      errorCategory: "ok",
      llmSummary: `已更新投递状态：${app.company || ""} - ${app.role || ""} => ${app.status || ""}，记录 ID ${app.id || ""}。`,
      uiPayload: { type: "application_status_updated", readBackVerified: true, ...json },
      rawData: json,
    };
  } catch (err) {
    return { success: false, data: null, error: `请求失败: ${err instanceof Error ? err.message : "unknown"}`, errorCategory: "transient" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `更新投递状态失败: ${result.error}`;
  const payload = result.rawData as UpdatePayload | undefined;
  const app = payload?.data || {};
  return `已更新投递状态：${app.company || ""} - ${app.role || ""} => ${app.status || ""}，记录 ID ${app.id || "-"}，事件 ID ${payload?.event?.id || "-"}`;
}

export const updateApplicationStatusTool: ToolDefinition = {
  name: "update_application_status",
  description: "更新求职 Pipeline 中某个投递记录的状态，并记录状态流转事件。模糊匹配时必须返回候选项并要求用户澄清。",
  matchHints: ["我投了", "标记已投递", "HR 回复了", "进入面试", "拿到 offer", "被拒了", "放弃这个岗位"],
  parameters: {
    id: { type: "number", required: false, description: "投递记录 ID，优先使用" },
    company: { type: "string", required: false, description: "公司名称，用于匹配记录" },
    role: { type: "string", required: false, description: "岗位名称，用于匹配记录" },
    reportNum: { type: "number", required: false, description: "报告编号，用于匹配记录" },
    jdId: { type: "number", required: false, description: "JD ID，用于匹配记录" },
    status: { type: "string", required: true, description: "目标状态: evaluated/applied/responded/interview/offer/rejected/discarded/skip" },
    note: { type: "string", required: false, description: "状态变更备注，例如 HR 回复内容" },
  },
  category: "action",
  handler,
  formatResult,
};
