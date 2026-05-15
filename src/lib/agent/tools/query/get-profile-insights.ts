import type { ToolDefinition, ToolResult } from "../types";
import { loadSemanticContext } from "@/lib/agent/memory/semantic";

async function handler(_params: Record<string, unknown>): Promise<ToolResult> {
  const semanticCtx = await loadSemanticContext();

  // Read profile signals from IndexedDB
  try {
    const { default: db } = await import("@/lib/db");
    const signals = await db.profiles?.toArray().catch(() => []) || [];
    const decisions = await db.agentDecisions?.toArray().catch(() => []) || [];

    return {
      success: true,
      data: {
        signalCount: signals.length,
        semanticContext: semanticCtx,
        hasEnoughData: signals.length >= 10 || !!semanticCtx,
      },
    };
  } catch {
    return {
      success: true,
      data: { signalCount: 0, semanticContext: semanticCtx, hasEnoughData: !!semanticCtx },
    };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `画像分析失败: ${result.error}`;
  const d = result.data as { signalCount: number; semanticContext: string; hasEnoughData: boolean };

  if (!d.hasEnoughData) {
    return "画像数据不足（信号 < 10 条），继续使用系统将自动积累。";
  }

  let output = "## 📊 求职画像洞察\n\n";
  output += `已积累 ${d.signalCount} 条行为信号。\n`;
  if (d.semanticContext) {
    output += `\n${d.semanticContext}\n`;
  }
  output += "\n请基于以上数据提炼用户求职行为模式、偏好趋势和隐性需求。";
  return output;
}

export const getProfileInsights: ToolDefinition = {
  name: "get_profile_insights",
  description: "从用户历史求职行为中提炼画像洞察：偏好行业、薪资区间、岗位类型、投递行为模式。当用户问'我的求职偏好''我适合什么'时调用此工具。",
  parameters: {
    timeframe: { type: "string", required: false, description: "分析时间范围: 30d/90d/all，默认 all" },
    focus: { type: "string", required: false, description: "聚焦维度: skills/salary/preferences/all，默认 all" },
  },
  category: "query",
  handler,
  formatResult,
};
