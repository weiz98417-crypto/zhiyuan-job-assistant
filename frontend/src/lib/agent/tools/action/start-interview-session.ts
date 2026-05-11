import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { company, role } = params as { company?: string; role?: string };
  if (!company || !role) {
    return { success: false, data: null, error: "请提供公司和岗位" };
  }

  const res = await fetch("/api/agent/coach/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company, role }),
  });

  if (!res.ok) {
    return { success: false, data: null, error: `启动失败: ${res.status}` };
  }
  const json = await res.json();
  if (!json.success) return { success: false, data: null, error: json.error || "启动失败" };

  return { success: true, data: json.data };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `面试启动失败: ${result.error}`;
  const d = result.data as { sessionId: string; phase: string; question: string };
  return `🎯 面试已开始\n**会话ID:** ${d.sessionId}\n**环节:** ${d.phase}\n\n**第一题:** ${d.question}\n\n请用户直接回答。回答后输入"继续面试 {sessionId} {回答}"来进入下一题。`;
}

export const startInterviewSession: ToolDefinition = {
  name: "start_interview_session",
  description: "启动模拟面试会话。当用户说'模拟面试''练习面试''面试一下'时调用此工具。需要提供公司名和目标岗位。",
  parameters: {
    company: { type: "string", required: true, description: "目标公司，如'字节跳动'" },
    role: { type: "string", required: true, description: "目标岗位，如'AI产品经理'" },
  },
  category: "action",
  handler,
  formatResult,
};
