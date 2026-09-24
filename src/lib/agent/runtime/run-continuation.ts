import type { AgentRunStatus } from "@/lib/agent/runtime/types";

export function acceptsContinuationInput(status: AgentRunStatus): boolean {
  return status === "queued" || status === "waiting_user" || status === "paused";
}

export function nextAgentRunStatusForContinuationInput(status: AgentRunStatus): AgentRunStatus {
  return status === "waiting_user" || status === "paused" ? "queued" : status;
}

export function nextAgentRunStatusForResolvedGate(status: AgentRunStatus): AgentRunStatus {
  return status === "waiting_user" ? "queued" : status;
}
