export const AGENT_HANDOFF_PARAM_KEYS = [
  "jdId",
  "offerId",
  "offerReportId",
  "applicationId",
  "reportNum",
  "company",
  "role",
  "intent",
  "newSession",
] as const;

export type AgentSessionUrlSyncDecision =
  | "await_target_url"
  | "acknowledge_target_url"
  | "follow_requested_url";

export function resolveAgentSessionUrlSync(input: {
  requestedSessionId: number;
  currentSessionId: number | null;
  manualTargetSessionId: number;
}): AgentSessionUrlSyncDecision {
  if (input.requestedSessionId === input.manualTargetSessionId) return "acknowledge_target_url";
  if (input.currentSessionId === input.manualTargetSessionId) return "await_target_url";
  return "follow_requested_url";
}

export function buildAgentSessionUrl(
  currentHref: string,
  options: { sessionId?: number; consumeHandoff?: boolean } = {},
): string {
  const url = new URL(currentHref);
  if (options.sessionId !== undefined) url.searchParams.set("sessionId", String(options.sessionId));
  if (options.consumeHandoff) {
    for (const key of AGENT_HANDOFF_PARAM_KEYS) url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceAgentSessionUrl(
  currentHref: string,
  options: { sessionId?: number; consumeHandoff?: boolean },
  history: Pick<History, "state" | "replaceState">,
): string {
  const nextUrl = buildAgentSessionUrl(currentHref, options);
  history.replaceState(history.state, "", nextUrl);
  return nextUrl;
}
