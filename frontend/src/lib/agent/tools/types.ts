import type { AgentToolParam } from "@/types";

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

export interface ToolDefinition<TParams = Record<string, unknown>> {
  name: string;
  description: string;
  category: "query" | "action";
  parameters: Record<string, ToolParameter>;
  handler: (params: TParams) => Promise<ToolResult>;
  formatResult: (result: ToolResult) => string;
}

// Re-export AgentToolParam for convenience (maps to ToolParameter)
export type { AgentToolParam };
