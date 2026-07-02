import type { AgentToolParam } from "@/types";
import type { VerifiedActionResult } from "@/lib/agent/verified-action";
import type { ToolGovernance } from "@/lib/agent/tool-governance";

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
}

/**
 * Tool result error category (modeled after OpenAI Assistants API status).
 * Tells the LLM and Agent Loop what to do next — no guessing.
 *
 * | Category          | Meaning           | Loop Action    | LLM Action          |
 * |-------------------|-------------------|----------------|---------------------|
 * | ok                | Success           | Continue       | Analyze & respond   |
 * | transient         | Temporary failure | autoRetry++    | Retry with new args |
 * | permanent         | Permanent failure | degradeToUser  | Tell user + suggest |
 * | need_user_input   | Needs user info   | degradeToUser  | Ask user directly   |
 */
export type ErrorCategory = "ok" | "transient" | "permanent" | "need_user_input";

export interface ToolResult {
  success: boolean;
  /**
   * @deprecated Use llmSummary, uiPayload, or rawData instead.
   * Single-field data is being phased out in favor of triple-pipe architecture.
   */
  data: unknown;
  error?: string;
  /**
   * Error classification for intelligent retry/degrade decisions.
   * Set explicitly for new tools. Omitted for legacy tools — resolveErrorCategory
   * provides the fallback ("ok" for success, "permanent" for failure).
   * - "ok": success path.
   * - "transient": retry-safe (network timeout, rate limit).
   * - "permanent": do NOT retry (encoding error, file not found).
   * - "need_user_input": do NOT retry, ask user for more info.
   */
  errorCategory?: ErrorCategory;
  /**
   * @deprecated Use errorCategory instead.
   * "transient" = recoverable:true, "permanent"/"need_user_input" = recoverable:false.
   */
  recoverable?: boolean;
  /** Hint for LLM on how to recover from the failure. Only used when recoverable is true. */
  retryHint?: string;
  /** If true, data._stream contains a ReadableStream for client-runner to read and yield events from. */
  _streaming?: boolean;

  // ── Triple-pipe architecture ──

  /** LLM context text: concise summary for decision-making. Default cap 800 chars. */
  llmSummary?: string;
  /** UI structured payload: rendered by React components, NOT fed to LLM context. */
  uiPayload?: Record<string, unknown>;
  /** Raw complete data for storage/logging. Falls back to uiPayload + llmSummary if absent. */
  rawData?: unknown;
  /** Machine-checkable evidence for durable mutations. Required for high-risk writes as tools migrate. */
  verifiedAction?: VerifiedActionResult;
}

export interface ToolDefinition<TParams = Record<string, unknown>> {
  name: string;
  description: string;
  category: "query" | "action";
  /** Keywords that hint this tool should be selected. Shown in LLM tool list as bias hints. */
  matchHints?: string[];
  parameters: Record<string, ToolParameter>;
  handler: (params: TParams) => Promise<ToolResult>;
  /**
   * @deprecated Use llmSummary field in ToolResult instead.
   * Falls back to this during migration when llmSummary is absent.
   */
  formatResult: (result: ToolResult) => string;
  /**
   * Build LLM context text from tool result. Default: returns result.llmSummary.
   * Only override if you need custom formatting beyond what llmSummary provides.
   */
  buildLLMSummary?: (result: ToolResult) => string;
  /** Max chars of llmSummary to feed into LLM context. Default 800 for search, 4000 for document tools. */
  toolCtxCap?: number;
  /** Centralized runtime governance metadata. Legacy tools may receive this from the governance registry. */
  governance?: ToolGovernance;
}

// Re-export AgentToolParam for convenience (maps to ToolParameter)
export type { AgentToolParam };
