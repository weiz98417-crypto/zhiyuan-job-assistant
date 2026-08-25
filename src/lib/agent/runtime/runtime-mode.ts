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

const READ_ONLY_TASKS = new Set([
  "resume_query",
  "general_chat",
  "system_diagnostics",
]);

export function getAgentRuntimeRolloutConfig(): AgentRuntimeRolloutConfig {
  const rawMode = String(process.env.AGENT_RUNTIME_MODE || "legacy").trim();
  const mode: AgentRuntimeMode = ["legacy", "shadow", "worker_readonly", "worker_all"].includes(rawMode)
    ? rawMode as AgentRuntimeMode
    : "legacy";
  const percentage = clampPercentage(Number(process.env.AGENT_RUNTIME_PERCENTAGE || 0));
  const allowlist = String(process.env.AGENT_RUNTIME_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return { mode, percentage, allowlist };
}

export function resolveAgentRuntimeAssignment(
  userId: string,
  taskType: string,
  config = getAgentRuntimeRolloutConfig(),
): AgentRuntimeAssignment {
  const cohortBucket = stableCohortBucket(userId);
  const selected = config.allowlist.includes(userId) || cohortBucket < clampPercentage(config.percentage);
  if (config.mode === "legacy" || !selected) {
    return { mode: config.mode, owner: "legacy", shadow: false, cohortBucket };
  }
  if (config.mode === "shadow") {
    return { mode: config.mode, owner: "legacy", shadow: true, cohortBucket };
  }
  if (config.mode === "worker_readonly" && !READ_ONLY_TASKS.has(taskType)) {
    return { mode: config.mode, owner: "legacy", shadow: false, cohortBucket };
  }
  return { mode: config.mode, owner: "worker", shadow: false, cohortBucket };
}

export function stableCohortBucket(userId: string): number {
  const prefix = createHash("sha256").update(userId).digest("hex").slice(0, 8);
  return (Number.parseInt(prefix, 16) % 10_000) / 100;
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
