import type { AgentRunStatus } from "@/lib/agent/runtime/types";
import type { AgentRuntimeObservation } from "@/lib/agent/runtime/observation";

export type RecoveryAction =
  | "transport_reconnect"
  | "retry"
  | "parameter_repair"
  | "switch_provider"
  | "safe_tool_replan"
  | "compact_context"
  | "reconcile"
  | "request_user"
  | "fail"
  | "ignore_observer";

export interface RecoveryDecision {
  action: RecoveryAction;
  nextStatus: AgentRunStatus;
  terminal: boolean;
  reason: string;
}

export interface RecoveryBudgetState {
  modelAttempts: number;
  sameToolArgsAttempts: number;
  fingerprintRecoveries: Record<string, number>;
  noProgressCycles: number;
  modelCycles: number;
  activeWallMs: number;
  tokenUsed: number;
  estimatedCostUsd: number;
  delegationCount: number;
  actionAttempts?: Partial<Record<RecoveryAction, number>>;
}

export const DEFAULT_RECOVERY_LIMITS = {
  modelAttempts: 3,
  sameToolArgsAttempts: 2,
  fingerprintRecoveries: 3,
  noProgressCycles: 3,
  modelCycles: 24,
  activeWallMs: 30 * 60 * 1_000,
  waitingUserMs: 7 * 24 * 60 * 60 * 1_000,
  childDepth: 2,
  activeChildren: 4,
} as const;

const EMPTY_BUDGET_STATE: RecoveryBudgetState = {
  modelAttempts: 0,
  sameToolArgsAttempts: 0,
  fingerprintRecoveries: {},
  noProgressCycles: 0,
  modelCycles: 0,
  activeWallMs: 0,
  tokenUsed: 0,
  estimatedCostUsd: 0,
  delegationCount: 0,
  actionAttempts: {},
};

export class RecoverySupervisor {
  decide(
    observation: AgentRuntimeObservation,
    budgets: RecoveryBudgetState = EMPTY_BUDGET_STATE,
  ): RecoveryDecision {
    if (
      budgets.modelCycles >= DEFAULT_RECOVERY_LIMITS.modelCycles
      || budgets.activeWallMs >= DEFAULT_RECOVERY_LIMITS.activeWallMs
    ) {
      return terminalDecision(observation.userSafeSummary);
    }

    if (
      observation.recoveryCapabilities.includes("compact_context")
      && actionAttempts(budgets, "compact_context") < 1
    ) {
      return {
        action: "compact_context",
        nextStatus: "recovering",
        terminal: false,
        reason: observation.userSafeSummary,
      };
    }

    if (observation.effectState === "unknown") {
      if (actionAttempts(budgets, "reconcile") >= 1) {
        return {
          action: "request_user",
          nextStatus: "waiting_user",
          terminal: false,
          reason: "副作用仍无法自动确认，需要人工对账后继续",
        };
      }
      return {
        action: "reconcile",
        nextStatus: "recovering",
        terminal: false,
        reason: observation.userSafeSummary,
      };
    }

    if (observation.category === "governance_denied") {
      if (actionAttempts(budgets, "safe_tool_replan") >= 2) {
        return observation.recoveryCapabilities.some((item) => item === "request_user" || item === "request_gate")
          ? { action: "request_user", nextStatus: "waiting_user", terminal: false, reason: observation.userSafeSummary }
          : terminalDecision(observation.userSafeSummary);
      }
      return {
        action: "safe_tool_replan",
        nextStatus: "recovering",
        terminal: false,
        reason: observation.userSafeSummary,
      };
    }

    if (
      observation.category === "no_progress"
      && budgets.noProgressCycles >= DEFAULT_RECOVERY_LIMITS.noProgressCycles
    ) {
      if (observation.recoveryCapabilities.includes("safe_tool_replan")) {
        if (actionAttempts(budgets, "safe_tool_replan") >= 2) {
          return observation.recoveryCapabilities.includes("request_user")
            ? { action: "request_user", nextStatus: "waiting_user", terminal: false, reason: observation.userSafeSummary }
            : terminalDecision(observation.userSafeSummary);
        }
        return {
          action: "safe_tool_replan",
          nextStatus: "recovering",
          terminal: false,
          reason: observation.userSafeSummary,
        };
      }
      if (observation.recoveryCapabilities.includes("request_user")) {
        return {
          action: "request_user",
          nextStatus: "waiting_user",
          terminal: false,
          reason: observation.userSafeSummary,
        };
      }
    }

    if (observation.category === "provider" || observation.category === "transport") {
      const fingerprintAttempts = budgets.fingerprintRecoveries[observation.fingerprint] || 0;
      if (
        budgets.modelAttempts < DEFAULT_RECOVERY_LIMITS.modelAttempts
        && fingerprintAttempts < DEFAULT_RECOVERY_LIMITS.fingerprintRecoveries
      ) {
        return {
          action: observation.category === "transport" ? "transport_reconnect" : "retry",
          nextStatus: "recovering",
          terminal: false,
          reason: observation.userSafeSummary,
        };
      }
      if (
        observation.recoveryCapabilities.includes("switch_provider")
        && actionAttempts(budgets, "switch_provider") < 1
      ) {
        return {
          action: "switch_provider",
          nextStatus: "recovering",
          terminal: false,
          reason: observation.userSafeSummary,
        };
      }
    }

    const replanAction: RecoveryAction = observation.category === "tool_validation"
      ? "parameter_repair"
      : "safe_tool_replan";
    if (
      ["tool_transient", "tool_validation", "database", "governance_unavailable", "contract_unmet", "unknown"].includes(observation.category)
      && actionAttempts(budgets, replanAction) < 2
    ) {
      return {
        action: replanAction,
        nextStatus: "recovering",
        terminal: false,
        reason: observation.userSafeSummary,
      };
    }

    return terminalDecision(observation.userSafeSummary);
  }
}

function actionAttempts(budgets: RecoveryBudgetState, action: RecoveryAction): number {
  return budgets.actionAttempts?.[action] || 0;
}

function terminalDecision(reason: string): RecoveryDecision {
  return { action: "fail", nextStatus: "failed", terminal: true, reason };
}
