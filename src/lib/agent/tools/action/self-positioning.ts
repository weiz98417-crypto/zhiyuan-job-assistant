import { loadAgentMode } from "@/lib/server/agent-mode-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

async function handler(
  _params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  if (context) {
    try {
      const content = loadAgentMode("dingwei");
      const phaseMatches = content.match(/##\s+(第[一二三四]阶段[：:][^\n]+)/g) || [];
      return {
        success: true,
        data: { framework: content, phases: phaseMatches.map((phase) => phase.replace(/^##\s+/, "")) },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "定位引导系统暂不可用",
        errorCategory: "transient",
        recoverable: true,
      };
    }
  }
  const res = await fetch("/api/agent/mode/dingwei");
  if (!res.ok) return { success: false, data: null, error: "定位引导系统暂不可用" };
  const json = await res.json();
  if (!json.success) return { success: false, data: null, error: json.error || "加载失败" };

  const content = json.data?.content as string || "";
  // Extract phase titles for concise output
  const phaseMatches = content.match(/##\s+(第[一二三四]阶段[：:][^\n]+)/g) || [];

  return {
    success: true,
    data: { framework: content, phases: phaseMatches.map((p: string) => p.replace(/^##\s+/, "")) },
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `定位系统加载失败: ${result.error}`;
  const d = result.data as { framework: string; phases: string[] };
  const phaseList = d.phases.map((p: string) => `- ${p}`).join("\n");
  return `## 🧭 职业方向探索\n\n4 阶段引导框架已加载：\n\n${phaseList}\n\n请引导用户从第一阶段开始。每完成一个阶段再进入下一阶段。`;
}

export const selfPositioning: ToolDefinition = {
  name: "self_positioning",
  description: "启动职业方向探索引导（4 阶段：兴趣探索→能力盘点→限幅信念检测→方向收敛）。当用户说'帮我找方向''我不知道做什么''迷茫'时调用此工具。",
  parameters: {},
  category: "action",
  handler,
  formatResult,
};
