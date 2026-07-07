import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const sp = new URLSearchParams();
  sp.set("context", "1");
  for (const key of ["id", "company", "role", "reportNum", "jdId"]) {
    const value = params[key];
    if (typeof value === "string" || typeof value === "number") sp.set(key, String(value));
  }
  try {
    const res = await fetch(`/api/data/applications?${sp.toString()}`);
    const json = await res.json();
    if (!json.success) {
      return { success: false, data: json, error: json.error || "读取投递上下文失败", errorCategory: "permanent" };
    }
    const ctx = json.data || {};
    const app = ctx.application || {};
    return {
      success: true,
      data: ctx,
      errorCategory: "ok",
      llmSummary: ctx.ambiguous
        ? `匹配到 ${ctx.candidates?.length || 0} 个投递记录，需要用户澄清。`
        : app.id
          ? `投递上下文: ${app.company || ""} - ${app.role || ""}，状态 ${app.status || ""}，事件 ${ctx.events?.length || 0} 条。`
          : (ctx.message || "没有找到对应投递记录。"),
      uiPayload: { type: "application_context", ...ctx },
      rawData: ctx,
    };
  } catch (err) {
    return { success: false, data: null, error: `请求失败: ${err instanceof Error ? err.message : "unknown"}`, errorCategory: "transient" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `读取投递上下文失败: ${result.error}`;
  const ctx = result.rawData as { application?: { company?: string; role?: string; status?: string }; candidates?: unknown[]; events?: unknown[]; nextActions?: Array<{ label: string }> } | undefined;
  if (ctx?.candidates?.length) return `匹配到 ${ctx.candidates.length} 个投递记录，请选择具体记录。`;
  const app = ctx?.application;
  if (!app) return "没有找到对应投递追踪记录。";
  const actions = (ctx?.nextActions || []).map((a) => a.label).join("、");
  return `${app.company || ""} - ${app.role || ""} 当前状态 ${app.status || ""}，事件 ${ctx?.events?.length || 0} 条。下一步：${actions || "暂无"}`;
}

export const getApplicationContextTool: ToolDefinition = {
  name: "get_application_context",
  description: "读取投递追踪记录、关联报告/JD、事件历史和下一步建议。用于评估、面试、跟进、谈薪前读取上下文。",
  matchHints: ["投递上下文", "这个岗位现在到哪了", "下一步建议", "读取追踪记录"],
  parameters: {
    id: { type: "number", required: false, description: "投递记录 ID" },
    company: { type: "string", required: false, description: "公司名称" },
    role: { type: "string", required: false, description: "岗位名称" },
    reportNum: { type: "number", required: false, description: "关联报告编号" },
    jdId: { type: "number", required: false, description: "关联 JD ID" },
  },
  category: "query",
  handler,
  formatResult,
};
