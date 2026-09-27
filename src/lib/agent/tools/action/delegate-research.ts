/**
 * delegate_research — 研究委派（M4，ADR-0027）。
 *
 * 主责 agent 把一个只读研究子任务交给目标 agent 的内联子 loop：子 loop 工具
 * 白名单 = 目标卡片只读集合 ∩ 委派方白名单（信任不继承）。委派审计记录在
 * 结果 uiPayload 中（delegation 事件链），写操作永不进入委派。
 */
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { validateDelegation } from "@/lib/agent/agent-collaboration";

interface DelegateParams {
  goal: string;
  target_agent_id: string;
  context?: string;
}

const DELEGATION_RESULT_BUDGET_CHARS = 2400;

async function handler(rawParams: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  const params = rawParams as unknown as DelegateParams;
  if (!context?.workerId || !Number.isFinite(context.fencingToken)) {
    return {
      success: false,
      data: null,
      error: "研究委派只能在 durable worker 执行的 Run 中使用",
      errorCategory: "policy_denied",
      recoverable: false,
    };
  }

  const validation = validateDelegation({ targetAgentId: params.target_agent_id, agentAllowlist: [...context.allowlist] });
  if (!validation.allowed) {
    return {
      success: false,
      data: { validation },
      error: validation.reason || "委派被拒绝",
      errorCategory: "policy_denied",
      recoverable: false,
      uiPayload: { type: "delegation_denied", reason: validation.reason },
    };
  }

  const goal = params.goal.trim();
  if (!goal) {
    return { success: false, data: null, error: "委派目标为空", errorCategory: "permanent", recoverable: false };
  }

  const delegationId = `dlg-${context.runId}-${Date.now()}`;
  try {
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const { registry } = await import("@/lib/agent/tools");
    const { getAgentById } = await import("@/lib/agent/registry");
    const targetAgent = getAgentById(params.target_agent_id);
    if (!targetAgent) {
      return { success: false, data: null, error: `目标 agent 不存在：${params.target_agent_id}`, errorCategory: "permanent", recoverable: false };
    }

    const effectiveTools = validation.effectiveTools;
    if (effectiveTools.length === 0) {
      return { success: false, data: null, error: "委派目标没有可用的只读研究工具", errorCategory: "permanent", recoverable: false };
    }

    const childPrompt = [
      `你是一个只读研究子任务（委派 id：${delegationId}）。`,
      `研究目标：${goal}`,
      params.context ? `主任务提供的背景：${params.context}` : "",
      "约束：只做信息收集与汇总，禁止任何写操作，禁止向用户提问；把结论整理为 findings（一段话）与 keyPoints（不超过 5 条）。",
    ].filter(Boolean).join("\n");

    let findings = "";
    for await (const event of agentLoopServer({
      agent: targetAgent,
      systemPrompt: childPrompt,
      messages: [{ role: "user", content: goal }],
      tools: registry.toOpenAITools(effectiveTools, true),
      executionContext: {
        ...context,
        runId: `${context.runId}:delegation:${delegationId}`,
        allowlist: effectiveTools,
      },
    })) {
      if (event.type === "text" && typeof event.content === "string") {
        findings += event.content;
      }
      if (context.signal?.aborted) break;
    }

    findings = findings.trim().slice(0, DELEGATION_RESULT_BUDGET_CHARS);
    if (!findings) {
      return {
        success: false,
        data: { delegationId },
        error: "委派的子任务没有返回任何研究结果",
        errorCategory: "transient",
        recoverable: true,
      };
    }

    const keyPoints = findings
      .split(/\n+/)
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
      .filter((line) => line.length > 8)
      .slice(0, 5);

    return {
      success: true,
      data: {
        delegationId,
        targetAgentId: params.target_agent_id,
        state: "completed",
        findings,
        keyPoints,
      },
      llmSummary: `委派研究完成（${params.target_agent_id}）：${findings.slice(0, 400)}`,
      errorCategory: "ok",
      uiPayload: {
        type: "delegation",
        delegationId,
        agentId: params.target_agent_id,
        goal,
        state: "completed",
        findings,
        keyPoints,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: { delegationId },
      error: err instanceof Error ? err.message : "委派子任务执行失败",
      errorCategory: "transient",
      recoverable: true,
      uiPayload: { type: "delegation", delegationId, state: "failed" },
    };
  }
}

export const delegateResearch: ToolDefinition = {
  name: "delegate_research",
  description: "把一个只读研究子任务委派给另一个专家 agent（它只收集信息并回传结论，不写任何数据、不接触用户）。当主任务需要补充背景研究但不值得打断当前任务时使用。",
  category: "action",
  parameters: {
    goal: { type: "string", required: true, description: "研究目标，一句话说清要查什么" },
    target_agent_id: { type: "string", required: true, description: "受委派 agent：general / resume / evaluate" },
    context: { type: "string", required: false, description: "给子任务的背景信息（可选）" },
  },
  outcome: {
    subagentOf: (params) => {
      const target = typeof params.target_agent_id === "string" ? params.target_agent_id : "general";
      const goal = typeof params.goal === "string" ? params.goal : "";
      if (!goal) return null;
      return { delegationId: "dlg-pending", agentId: target, goal };
    },
  },
  handler,
  formatResult: (result) => result.llmSummary || (result.success ? "委派研究完成" : `委派失败：${result.error}`),
  toolCtxCap: 900,
};
