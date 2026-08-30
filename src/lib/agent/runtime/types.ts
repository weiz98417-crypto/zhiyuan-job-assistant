export const AGENT_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_user",
  "paused",
  "recovering",
  "verifying",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const NON_TERMINAL_AGENT_RUN_STATUSES: readonly AgentRunStatus[] = [
  "queued",
  "running",
  "waiting_user",
  "paused",
  "recovering",
  "verifying",
  "cancel_requested",
];

export const TERMINAL_AGENT_RUN_STATUSES: readonly AgentRunStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
];

export function isTerminalAgentRunStatus(status: AgentRunStatus): boolean {
  return TERMINAL_AGENT_RUN_STATUSES.includes(status);
}
