import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { getDurableAgentRuntime } from "@/lib/agent/runtime/runtime-factory";
import { ResearchDelegationService } from "@/lib/agent/runtime/research-delegation";

async function handler(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  if (!context?.workerId || !Number.isFinite(context.fencingToken)) return {
    success: false, data: null, error: "研究委派只能在 durable worker 执行的 Run 中使用", errorCategory: "policy_denied", recoverable: false,
  };
  return new ResearchDelegationService(getDurableAgentRuntime()).execute(params, context);
}

export const delegateResearch: ToolDefinition = {
  name: "delegate_research",
  description: "用户明确授权后，把只读研究委派给专家的独立持久化 Run。研究范围必须沿用当前用户原文；required 失败会等待恢复，明确可选的 supporting 失败必须说明限制。",
  category: "action",
  parameters: {
    goal: { type: "string", required: true, description: "当前用户明确授权的研究目标，使用用户原文中的连续短语" },
    target_agent_id: { type: "string", required: true, description: "用户授权的专家：general / resume / evaluate" },
    dependency: { type: "string", required: true, description: "required 或 supporting；仅用户明确说可选/辅助研究时才能使用 supporting" },
    source_artifact_ids: { type: "array", required: false, description: "当前 Run 已绑定的材料 ID；用户授权消息由服务端自动加入" },
  },
  handler,
  formatResult: (result) => result.llmSummary || (result.success ? "委派研究完成" : `委派失败：${result.error}`),
  toolCtxCap: 8_000,
};
