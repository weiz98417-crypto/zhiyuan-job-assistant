import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { getDurableAgentRuntime } from "@/lib/agent/runtime/runtime-factory";
import { executeGovernedHandoff } from "@/lib/agent/runtime/governed-handoff";

async function handler(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  if (!context?.workerId || !Number.isFinite(context.fencingToken)) return {
    success: false, data: null, error: "主责交接只能在 durable worker 执行的 Run 中使用",
    errorCategory: "policy_denied", recoverable: false,
  };
  return executeGovernedHandoff(getDurableAgentRuntime(), params, context);
}

export const transferToAgent: ToolDefinition = {
  name: "transfer_to_agent",
  description: "用户明确授权后将当前目标交接给另一专家，保留同一 Run、Program、目标和已绑定来源。跨目标必须通过 Run Admission 创建新 Run，工具仅返回 admission_required。",
  category: "action",
  parameters: {
    target_agent_id: { type: "string", required: true, description: "用户明确授权的专家：general / resume / evaluate" },
    goal: { type: "string", required: true, description: "用户原文中明确授权的目标；同目标交接必须等于当前 Run Contract 的 target" },
    target_task_type: { type: "string", required: false, description: "保持当前 taskType；跨目标任务类型只能返回 admission_required" },
    source_artifact_ids: { type: "array", required: false, description: "当前 Run 已绑定材料 ID，授权消息由服务端自动加入" },
    reason: { type: "string", required: true, description: "交接原因" },
  },
  handler,
  formatResult: (result) => result.llmSummary || (result.success ? "交接完成" : `交接失败：${result.error}`),
  toolCtxCap: 8_000,
};
