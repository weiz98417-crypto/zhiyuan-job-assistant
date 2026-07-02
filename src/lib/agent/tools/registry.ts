import type { ToolDefinition, ToolResult } from "./types";
import { enforceReadBackSuccessGate } from "./readback-verification";
import { getLegacyToolGovernanceCompatibility, getToolGovernance } from "@/lib/agent/tool-governance";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private activeAgentTools: Set<string> | null = null;

  register(tool: ToolDefinition): void {
    const governance = tool.governance || getToolGovernance(tool.name);
    if (!governance && process.env.NODE_ENV !== "production") {
      console.warn(getLegacyToolGovernanceCompatibility(tool.name).warning);
    }
    this.tools.set(tool.name, governance ? { ...tool, governance } : tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: "query" | "action"): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  buildToolListText(): string {
    const tools = this.getAll();
    if (tools.length === 0) return "";

    const lines = tools.map((t) => {
      const paramsStr = Object.entries(t.parameters)
        .map(([k, p]) => `${k}${p.required ? "*" : "?"}: ${p.description}`)
        .join(", ");
      const hints = t.matchHints?.length ? ` [提示: ${t.matchHints.join(", ")}]` : "";
      return `- ${t.name}: ${t.description}${hints}${paramsStr ? ` (${paramsStr})` : ""}`;
    });

    return `\n## 可用工具\n\n${lines.join("\n")}`;
  }

  toOpenAITools(): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, { type: string; description: string }>;
        required: string[];
      };
    };
  }> {
    return this.getAll().map((t) => {
      const properties: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];
      for (const [key, param] of Object.entries(t.parameters)) {
        properties[key] = { type: param.type, description: param.description };
        if (param.required) required.push(key);
      }
      return {
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: { type: "object", properties, required },
        },
      };
    });
  }

  async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    // Tool whitelist enforcement for multi-agent architecture
    if (this.activeAgentTools && !this.activeAgentTools.has(name)) {
      return {
        success: false,
        data: null,
        error: `工具 ${name} 在当前 Agent 模式下不可用`,
      };
    }
    const tool = this.tools.get(name);
    if (!tool) return { success: false, data: null, error: `工具 ${name} 不存在`, errorCategory: "permanent" };
    try {
      const result = await tool.handler(params);
      return enforceReadBackSuccessGate(name, result);
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : "Tool execution error" };
    }
  }

  formatResult(result: ToolResult, toolName: string): string {
    const tool = this.tools.get(toolName);
    if (!tool) return JSON.stringify(result).slice(0, 500);
    return tool.formatResult(result);
  }

  /** Set tool whitelist for current active agent (multi-agent architecture) */
  setActiveAgentTools(toolNames: string[]): void {
    this.activeAgentTools = new Set(toolNames);
  }

  /** Clear tool whitelist (allow all tools) */
  clearActiveAgentTools(): void {
    this.activeAgentTools = null;
  }
}
