import {
  isTerminalAgentRunStatus,
  type AgentRunStatus,
} from "@/lib/agent/runtime/types";

const ALLOWED_TRANSITIONS: Readonly<Record<AgentRunStatus, readonly AgentRunStatus[]>> = {
  queued: ["running", "cancel_requested", "failed"],
  running: ["waiting_user", "recovering", "verifying", "cancel_requested", "failed"],
  waiting_user: ["queued", "cancel_requested", "failed"],
  recovering: ["queued", "running", "waiting_user", "cancel_requested", "failed"],
  verifying: ["running", "recovering", "waiting_user", "cancel_requested", "succeeded", "failed"],
  cancel_requested: ["cancelled", "recovering", "failed"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function transitionAgentRun(
  current: AgentRunStatus,
  next: AgentRunStatus,
): AgentRunStatus {
  if (isTerminalAgentRunStatus(current)) {
    throw new Error(`Terminal Agent Run ${current} cannot transition to ${next}`);
  }
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new Error(`Illegal Agent Run transition from ${current} to ${next}`);
  }
  return next;
}

export function canTransitionAgentRun(current: AgentRunStatus, next: AgentRunStatus): boolean {
  return !isTerminalAgentRunStatus(current) && ALLOWED_TRANSITIONS[current].includes(next);
}
