import type { AgentRunStatus } from "@/lib/agent/runtime/types";

export function nextAgentRunStatusForContinuationInput(status: AgentRunStatus): AgentRunStatus {
  return status === "waiting_user" || status === "paused" ? "queued" : status;
}

export function nextAgentRunStatusForResolvedGate(status: AgentRunStatus): AgentRunStatus {
  return status === "waiting_user" ? "queued" : status;
}
