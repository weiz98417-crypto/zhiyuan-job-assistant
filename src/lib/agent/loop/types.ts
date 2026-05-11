/* ── Agent Loop Types ── */

export interface LoopConfig {
  maxIterations: number;
  toolWhitelist?: string[];
}

export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  maxIterations: 5,
};

export type AgentPhase = "understanding" | "executing" | "verifying" | "reflecting" | "responding" | "done";

export interface LoopState {
  iteration: number;
  consecutiveFailures: number;
  contextSize: number;
  phase: AgentPhase;
}

export type SSEEvent =
  | { type: "phase"; phase: AgentPhase }
  | { type: "thinking_content"; content: string }
  | { type: "tool_call"; name: string; params: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string; success: boolean }
  | { type: "tool_error"; name: string; error: string; recoverable: boolean }
  | { type: "result_quality"; quality: "good" | "empty" | "irrelevant" }
  | { type: "text"; content: string }
  | { type: "tool_calls"; tool_calls: Array<{ id: string; name: string; arguments: string }> }
  | { type: "done" };

export interface LoopContext {
  systemPrompt: string;
  messages: { role: string; content: string }[];
  apiKey: string;
  latestUserMessage: string;
}
