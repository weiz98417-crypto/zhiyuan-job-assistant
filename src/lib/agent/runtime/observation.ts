export type ObservationCategory =
  | "transport"
  | "provider"
  | "tool_transient"
  | "tool_permanent"
  | "tool_validation"
  | "governance_denied"
  | "governance_unavailable"
  | "database"
  | "observer"
  | "no_progress"
  | "contract_unmet"
  | "cancel_requested"
  | "unknown";

export type ObservationRetryability = "retry" | "replan" | "wait_user" | "never";
export type ToolEffectState =
  | "not_dispatched"
  | "not_executed"
  | "unknown"
  | "applied"
  | "verified"
  | "rolled_back";

export interface AgentRuntimeObservation {
  category: ObservationCategory;
  stage: string;
  retryability: ObservationRetryability;
  effectState: ToolEffectState;
  fingerprint: string;
  userSafeSummary: string;
  diagnosticRef: string;
  recoveryCapabilities: string[];
}
