import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { runProfileSop } from "@/lib/server/profile-sop-service";

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  if (!context) return {
    success: false, data: null, error: "定位引导与确认须由 Worker 使用当前会话执行",
    errorCategory: "policy_denied", recoverable: false,
  };
  try {
    const data = await runProfileSop(context.principal, {
      action: typeof params.action === "string" ? params.action : "start",
      answer: typeof params.answer === "string" ? params.answer : undefined,
      conversationId: context.conversationId,
    });
    return { success: true, data, errorCategory: "ok", rawData: data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "画像 SOP 执行失败";
    const needsInput = /请提供|请明确|请先|来源证据|当前用户原文|Unknown action/.test(message);
    const denied = /不属于|来源不一致|来源会话不存在/.test(message);
    return {
      success: false, data: null, error: message,
      errorCategory: needsInput ? "need_user_input" : denied ? "policy_denied" : "permanent",
      recoverable: false,
    };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `操作失败: ${result.error}`;
  const data = result.data as Record<string, unknown> | null;
  if (!data) return "操作完成";
  if (data.reset) return "定位引导已重新开始；原有画像未变更。";
  if (data.done) return `画像挖掘完成！${data.summary || ""}`;
  if (data.alreadyStarted) return `[阶段 ${data.stage}/5 — 继续] ${data.prompt || ""}（不要在同一个回合内再次调用 start）`;
  return `[阶段 ${data.stage}/5] ${data.prompt || ""}`;
}

export const mineProfile: ToolDefinition = {
  name: "mine_profile",
  outcome: {
    waitsForUser: (result) => {
      const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
      return data.done !== true && typeof data.prompt === "string" && data.prompt.trim().length > 0;
    },
  },
  description: "从当前持久会话开始或继续定位引导。引导动作不写画像；complete 仅在用户明确确认已展示的来源结果后，由 Worker 验源写入并独立读回。",
  parameters: {
    action: { type: "string", required: true, description: "操作: start（开始/继续），answer（核对当前回答），stage_prompt（获取引导语），complete（确认并保存），reset（重新开始引导）" },
    answer: { type: "string", required: false, description: "action=answer 时必须为当前用户的完整原文，不得改写或补造" },
  },
  category: "action",
  handler,
  formatResult,
};
