import { createHash } from "crypto";

export type AgentFeatureFlagName =
  | "admission_shadow"
  | "continuation_kernel"
  | "task_program_vertical_slice"
  | "item_dual_write"
  | "item_read_switch"
  | "unified_production_cutover";

export interface AgentFeatureFlagDefinition {
  name: AgentFeatureFlagName;
  purpose: string;
  owner: string;
  cohort: string[];
  metrics: string[];
  rollback: string;
  removalStage: string;
}

export interface AgentFeatureFlagState extends AgentFeatureFlagDefinition {
  enabled: boolean;
  cohortPercentage: number;
}

export const AGENT_FEATURE_FLAG_DEFINITIONS: Record<AgentFeatureFlagName, AgentFeatureFlagDefinition> = {
  admission_shadow: {
    name: "admission_shadow",
    purpose: "Compare server Run Admission decisions with the legacy route.",
    owner: "run-admission",
    cohort: [],
    metrics: ["admission_decision_diff", "admission_latency_ms"],
    rollback: "Disable shadow comparison without changing the authoritative route.",
    removalStage: "after unified production cutover stability window",
  },
  continuation_kernel: {
    name: "continuation_kernel",
    purpose: "Route continuation inputs through the Continuation Stimulus kernel.",
    owner: "run-continuation",
    cohort: [],
    metrics: ["stimulus_conformance_diff", "duplicate_stimulus_count"],
    rollback: "Stop accepting new kernel commands; preserve already persisted stimuli.",
    removalStage: "after Postgres and Memory conformance gate",
  },
  task_program_vertical_slice: {
    name: "task_program_vertical_slice",
    purpose: "Enable versioned Task Program execution for selected tasks.",
    owner: "task-program",
    cohort: [],
    metrics: ["program_stage_rejection", "verified_fact_latency_ms"],
    rollback: "Route queued work to the last compatible Program version.",
    removalStage: "after every production Program has a stable version",
  },
  item_dual_write: {
    name: "item_dual_write",
    purpose: "Persist Conversation Item projections alongside the legacy read model.",
    owner: "item-projection",
    cohort: [],
    metrics: ["item_projection_diff", "item_write_failure_count"],
    rollback: "Disable the new write path while retaining durable Run Events.",
    removalStage: "after projection equivalence and backfill gate",
  },
  item_read_switch: {
    name: "item_read_switch",
    purpose: "Read Agent Conversation from persisted Conversation Items.",
    owner: "item-projection",
    cohort: [],
    metrics: ["item_refresh_realtime_diff", "item_read_error_count"],
    rollback: "Return reads to the compatibility Session Message adapter for the canary window.",
    removalStage: "after unified production cutover stability window",
  },
  unified_production_cutover: {
    name: "unified_production_cutover",
    purpose: "Switch all four architecture seams in one production deployment.",
    owner: "agent-platform",
    cohort: [],
    metrics: ["run_duplicate_count", "hard_gate_failure_count", "legacy_fallback_count"],
    rollback: "Use the short-lived cutover rollback switch and stop new worker claims.",
    removalStage: "after cutover stability window and legacy removal",
  },
};

export function getAgentFeatureFlagState(
  name: AgentFeatureFlagName,
  env: Record<string, string | undefined> = process.env,
): AgentFeatureFlagState {
  const definition = AGENT_FEATURE_FLAG_DEFINITIONS[name];
  const prefix = `AGENT_FLAG_${name.toUpperCase()}`;
  const enabled = parseBoolean(env[`${prefix}_ENABLED`]);
  const cohortPercentage = clampPercentage(Number(env[`${prefix}_PERCENTAGE`] || 0));
  const cohort = String(env[`${prefix}_COHORT`] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return { ...definition, enabled, cohortPercentage, cohort };
}

export function isAgentFeatureFlagEnabled(
  name: AgentFeatureFlagName,
  userId = "",
  env: Record<string, string | undefined> = process.env,
): boolean {
  const state = getAgentFeatureFlagState(name, env);
  if (!state.enabled) return false;
  if (state.cohort.includes(userId)) return true;
  if (state.cohortPercentage <= 0 || !userId) return false;
  return stableCohortPercentage(userId) < state.cohortPercentage;
}

export function validateAgentFeatureFlagPlan(states: AgentFeatureFlagState[]): string[] {
  const errors: string[] = [];
  const byName = new Map(states.map((state) => [state.name, state]));
  for (const state of states) {
    if (!state.owner.trim()) errors.push(`${state.name}: owner is required`);
    if (!state.purpose.trim()) errors.push(`${state.name}: purpose is required`);
    if (!state.metrics.length) errors.push(`${state.name}: metrics are required`);
    if (!state.rollback.trim()) errors.push(`${state.name}: rollback is required`);
    if (!state.removalStage.trim()) errors.push(`${state.name}: removalStage is required`);
  }
  if (byName.get("item_read_switch")?.enabled && !byName.get("item_dual_write")?.enabled) {
    errors.push("item_read_switch requires item_dual_write");
  }
  if (byName.get("unified_production_cutover")?.enabled) {
    for (const dependency of ["admission_shadow", "continuation_kernel", "task_program_vertical_slice", "item_dual_write", "item_read_switch"] as AgentFeatureFlagName[]) {
      if (!byName.get(dependency)?.enabled) errors.push(`unified_production_cutover requires ${dependency}`);
    }
  }
  return errors;
}

export function assertAgentFeatureFlagPlan(states: AgentFeatureFlagState[]): void {
  const errors = validateAgentFeatureFlagPlan(states);
  if (errors.length) throw new Error(`Invalid Agent feature flag plan: ${errors.join("; ")}`);
}

export function stableCohortPercentage(userId: string): number {
  const hex = createHash("sha256").update(userId).digest("hex").slice(0, 8);
  return (Number.parseInt(hex, 16) % 10_000) / 100;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function clampPercentage(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}
