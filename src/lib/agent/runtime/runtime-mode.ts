import { createHash } from "crypto";

export type AgentRuntimeMode = "legacy" | "shadow" | "worker_readonly" | "worker_all";

export interface AgentRuntimeRolloutConfig {
  mode: AgentRuntimeMode;
  percentage: number;
  allowlist: string[];
}

export interface AgentRuntimeAssignment {
  mode: AgentRuntimeMode;
  owner: "legacy" | "worker";
  shadow: boolean;
  cohortBucket: number;
}

let warnedAboutLegacyMode = false;

export function getAgentRuntimeRolloutConfig(): AgentRuntimeRolloutConfig {
  const rawMode = String(process.env.AGENT_RUNTIME_MODE || "").trim();
  // M1 (ADR-0023): worker_all is the only supported mode. Historical values are
  // accepted for forward compatibility but resolve to worker_all with a warning.
  if (rawMode && rawMode !== "worker_all" && !warnedAboutLegacyMode) {
    warnedAboutLegacyMode = true;
    console.warn(`[runtime-mode] AGENT_RUNTIME_MODE=${rawMode} is no longer supported since M1; using worker_all.`);
  }
  return { mode: "worker_all", percentage: 0, allowlist: [] };
}

export function resolveAgentRuntimeAssignment(
  userId: string,
  _taskType: string,
  config = getAgentRuntimeRolloutConfig(),
): AgentRuntimeAssignment {
  const cohortBucket = stableCohortBucket(userId);
  return { mode: config.mode, owner: "worker", shadow: false, cohortBucket };
}

export function stableCohortBucket(userId: string): number {
  const prefix = createHash("sha256").update(userId).digest("hex").slice(0, 8);
  return (Number.parseInt(prefix, 16) % 10_000) / 100;
}
