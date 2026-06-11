/* ── Agent Loop Types ── */

import type { VerifiedActionResult } from "@/lib/agent/verified-action";

export interface LoopConfig {
  maxIterations: number;
  toolWhitelist?: string[];
}

export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  maxIterations: 5, // bumped from 3 — resume optimization + reference lookup need 3-4 iterations
};

/** Tool result quality classification */
export type ResultQuality = "good" | "empty" | "irrelevant" | "garbled";

export type AgentPhase =
  | "understanding" | "executing" | "verifying" | "reflecting" | "responding" | "done"
  | "compressing_context"
  | "extracting_ocr" | "extracting_jd" | "jd_extracted"
  | "detecting_archetype" | "archetype_detected";

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
  | { type: "tool_result"; name: string; result: string; success: boolean; data?: unknown; uiPayload?: Record<string, unknown>; verifiedAction?: VerifiedActionResult }
  | { type: "tool_error"; name: string; error: string; recoverable: boolean }
  | { type: "result_quality"; quality: ResultQuality }
  | { type: "text"; content: string }
  | { type: "tool_calls"; tool_calls: Array<{ id: string; name: string; arguments: string }> }
  | { type: "intent"; agentId: string; reason: string; modelTier?: string }
  | { type: "agent_switch"; agentId: string; agentName: string }
  | { type: "done"; company?: string; role?: string; archetype?: string; overallScore?: number; blocks?: Record<string, unknown>; jdText?: string }
  // Stream evaluation events (from /api/evaluate/stream)
  | { type: "block_start"; block: string; label: string }
  | { type: "block_chunk"; block: string; content: string }
  | { type: "block_done"; block: string }
  | { type: "score"; block: string; score: number }
  | { type: "overall_score"; score: number }
  | { type: "search_start"; query: string; source: string }
  | { type: "search_result"; count: number; summary: string }
  | { type: "error"; block?: string; message: string }
  // Persist notification
  | { type: "persist_done"; reportNum: number; company: string; role: string; score: number; readBackVerified?: boolean; readBackError?: string };

export interface LoopContext {
  systemPrompt: string;
  messages: { role: string; content: string }[];
  apiKey: string;
  latestUserMessage: string;
}
