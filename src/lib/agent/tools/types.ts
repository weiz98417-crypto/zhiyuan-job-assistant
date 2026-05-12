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
  /** Whether the failure is recoverable (LLM can retry with different params). Defaults to true for backward compat. */
  recoverable?: boolean;
  /** Hint for LLM on how to recover from the failure. Only used when recoverable is true. */
  retryHint?: string;
  /** If true, data._stream contains a ReadableStream for client-runner to read and yield events from. */
  _streaming?: boolean;
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
