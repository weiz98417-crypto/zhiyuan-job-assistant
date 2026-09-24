/**
 * transfer_to_agent — 主责交接（M4，ADR-0027）。
 *
 * 对模型是一个普通工具；成功结果携带 data.handoff，loop 据此切换主责 agent
 * （换系统提示词与工具表）。只能沿合法任务转换图的边走。
 */
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { getDurableAgentRuntime } from "@/lib/agent/runtime/runtime-factory";
import { validateHandoff } from "@/lib/agent/agent-collaboration";
import type { AgentTaskType } from "@/lib/agent/task-contract";

interface TransferParams {
  target_agent_id: string;
  reason: string;
  summary_for_target?: string;
}

async function handler(rawParams: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  const params = rawParams as unknown as TransferParams;
  if (!context?.workerId || !Number.isFinite(context.fencingToken)) {
    return {
      success: false,
      data: null,
      error: "主责交接只能在 durable worker 执行的 Run 中使用",
      errorCategory: "policy_denied",
      recoverable: false,
    };
  }

  let currentTask: AgentTaskType | null = null;
  try {
    const run = await getDurableAgentRuntime().getRun(context.principal, context.runId);
    currentTask = ((run?.contract as Record<string, unknown> | undefined)?.taskType as AgentTaskType | undefined) || null;
  } catch {
    currentTask = null;
  }

  const validation = validateHandoff({ currentTask, targetAgentId: params.target_agent_id });
  if (!validation.allowed) {
    return {
      success: false,
      data: { validation },
      error: validation.reason || "交接被拒绝",
      errorCategory: "policy_denied",
      recoverable: false,
      uiPayload: { type: "handoff_denied", reason: validation.reason },
    };
  }

  return {
    success: true,
    data: {
      handoff: {
        agentId: params.target_agent_id,
        fromTask: validation.fromTask,
        toTask: validation.toTask,
        reason: params.reason,
        summaryForTarget: params.summary_for_target || "",
      },
    },
    llmSummary: `主责已交接给 ${params.target_agent_id}：${params.reason}`,
    errorCategory: "ok",
    uiPayload: {
      type: "handoff",
      agentId: params.target_agent_id,
      fromTask: validation.fromTask,
      toTask: validation.toTask,
      reason: params.reason,
    },
  };
}

export const transferToAgent: ToolDefinition = {
  name: "transfer_to_agent",
  description: "把当前任务的主责移交给另一个专家 agent（沿合法任务转换图）。当用户的目标已经明确属于另一个领域、当前任务到达安全点时使用。不要用它跳过当前任务的必做步骤。",
  category: "action",
  parameters: {
    target_agent_id: { type: "string", required: true, description: "目标 agent：general / resume / evaluate" },
    reason: { type: "string", required: true, description: "交接原因，一句话" },
    summary_for_target: { type: "string", required: false, description: "给接手 agent 的上下文摘要：已做了什么、用户要什么" },
  },
  handler,
  formatResult: (result) => result.llmSummary || (result.success ? "交接完成" : `交接失败：${result.error}`),
  toolCtxCap: 600,
};
