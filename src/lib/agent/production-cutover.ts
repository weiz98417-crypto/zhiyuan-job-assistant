import type { AgentReleaseGateResult } from "@/lib/agent/eval-release-gates";
import type { AgentFeatureFlagName } from "@/lib/agent/feature-flags";

export type AgentCutoverPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AgentCanaryMetrics {
  runCreateErrorRate: number;
  duplicateRunCount: number;
  duplicateItemCount: number;
  waitingUserStallRate: number;
  gateRecoveryRate: number;
  programFailureRate: number;
  projectionDiffRate: number;
  rawPayloadFallbackCount: number;
  artifactReadBackFailureCount: number;
}

export interface AgentCanaryThresholds {
  runCreateErrorRateMax: number;
  duplicateRunCountMax: number;
  duplicateItemCountMax: number;
  waitingUserStallRateMax: number;
  gateRecoveryRateMin: number;
  programFailureRateMax: number;
  projectionDiffRateMax: number;
  rawPayloadFallbackCountMax: number;
  artifactReadBackFailureCountMax: number;
}

export interface AgentCutoverReadiness {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  rollbackTarget: string;
  requiredFlags: AgentFeatureFlagName[];
}

export interface AgentLegacyRemovalEvidence {
  legacyPath: string;
  replacementOwner: string;
  coveredFixtures: string[];
  removedFlags: AgentFeatureFlagName[];
  staticReachabilityCheck: boolean;
  releaseReplayPassed: boolean;
}

export const AGENT_CUTOVER_FLAGS: AgentFeatureFlagName[] = [
  "admission_shadow",
  "continuation_kernel",
  "task_program_vertical_slice",
  "item_dual_write",
  "item_read_switch",
  "unified_production_cutover",
];

export const DEFAULT_AGENT_CANARY_THRESHOLDS: AgentCanaryThresholds = {
  runCreateErrorRateMax: 0.01,
  duplicateRunCountMax: 0,
  duplicateItemCountMax: 0,
  waitingUserStallRateMax: 0.05,
  gateRecoveryRateMin: 0.95,
  programFailureRateMax: 0.05,
  projectionDiffRateMax: 0,
  rawPayloadFallbackCountMax: 0,
  artifactReadBackFailureCountMax: 0,
};

export function evaluateAgentCutoverReadiness(input: {
  releaseGates: AgentReleaseGateResult;
  invariants: {
    admissionGoldensPassed: boolean;
    adapterConformancePassed: boolean;
    programFactsComplete: boolean;
    durableRunPerGoal: boolean;
    noDuplicateActiveRuns: boolean;
    gateStimulusItemConverged: boolean;
    artifactReadBackPassed: boolean;
    realtimeRefreshEquivalent: boolean;
    productionReplayPassed: boolean;
    browserJourneysPassed: boolean;
    noRawPayloadFallback: boolean;
  };
  flags: Partial<Record<AgentFeatureFlagName, boolean>>;
  rollbackTarget?: string;
}): AgentCutoverReadiness {
  const blockers = input.releaseGates.passed ? [] : [
    ...input.releaseGates.hardFailures,
    ...input.releaseGates.missingEvidence,
  ];
  const invariantLabels: Array<[keyof typeof input.invariants, string]> = [
    ["admissionGoldensPassed", "admission_goldens"],
    ["adapterConformancePassed", "adapter_conformance"],
    ["programFactsComplete", "program_verified_facts"],
    ["durableRunPerGoal", "durable_run_per_goal"],
    ["noDuplicateActiveRuns", "duplicate_active_run"],
    ["gateStimulusItemConverged", "gate_stimulus_item_convergence"],
    ["artifactReadBackPassed", "artifact_read_back"],
    ["realtimeRefreshEquivalent", "realtime_refresh_equivalence"],
    ["productionReplayPassed", "production_replay"],
    ["browserJourneysPassed", "browser_journeys"],
    ["noRawPayloadFallback", "raw_payload_fallback"],
  ];
  invariantLabels.forEach(([key, label]) => {
    if (!input.invariants[key]) blockers.push(`invariant:${label}`);
  });
  for (const flag of AGENT_CUTOVER_FLAGS) {
    if (!input.flags[flag]) blockers.push(`flag:${flag}`);
  }
  return {
    ready: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    warnings: input.releaseGates.qualityWarnings,
    rollbackTarget: input.rollbackTarget || "previous-supported-production-combination",
    requiredFlags: [...AGENT_CUTOVER_FLAGS],
  };
}

export function evaluateAgentCanaryMetrics(
  metrics: AgentCanaryMetrics,
  thresholds: AgentCanaryThresholds = DEFAULT_AGENT_CANARY_THRESHOLDS,
): { healthy: boolean; violations: string[] } {
  const violations: string[] = [];
  if (metrics.runCreateErrorRate > thresholds.runCreateErrorRateMax) violations.push("run_create_error_rate");
  if (metrics.duplicateRunCount > thresholds.duplicateRunCountMax) violations.push("duplicate_run");
  if (metrics.duplicateItemCount > thresholds.duplicateItemCountMax) violations.push("duplicate_item");
  if (metrics.waitingUserStallRate > thresholds.waitingUserStallRateMax) violations.push("waiting_user_stall");
  if (metrics.gateRecoveryRate < thresholds.gateRecoveryRateMin) violations.push("gate_recovery");
  if (metrics.programFailureRate > thresholds.programFailureRateMax) violations.push("program_failure");
  if (metrics.projectionDiffRate > thresholds.projectionDiffRateMax) violations.push("projection_diff");
  if (metrics.rawPayloadFallbackCount > thresholds.rawPayloadFallbackCountMax) violations.push("raw_payload_fallback");
  if (metrics.artifactReadBackFailureCount > thresholds.artifactReadBackFailureCountMax) violations.push("artifact_read_back");
  return { healthy: violations.length === 0, violations };
}

export function canRemoveAgentLegacyPath(evidence: AgentLegacyRemovalEvidence): boolean {
  return Boolean(
    evidence.legacyPath.trim()
    && evidence.replacementOwner.trim()
    && evidence.coveredFixtures.length > 0
    && evidence.staticReachabilityCheck
    && evidence.releaseReplayPassed,
  );
}
