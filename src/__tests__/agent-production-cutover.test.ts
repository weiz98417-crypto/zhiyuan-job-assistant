import { describe, expect, it } from "vitest";
import {
  canRemoveAgentLegacyPath,
  evaluateAgentCanaryMetrics,
  evaluateAgentCutoverReadiness,
} from "@/lib/agent/production-cutover";

describe("agent production cutover", () => {
  it("blocks a partial production combination", () => {
    const result = evaluateAgentCutoverReadiness({
      releaseGates: { passed: true, hardFailures: [], missingEvidence: [], qualityWarnings: [], layerResults: [] },
      invariants: {
        admissionGoldensPassed: true,
        adapterConformancePassed: true,
        programFactsComplete: true,
        durableRunPerGoal: true,
        noDuplicateActiveRuns: true,
        gateStimulusItemConverged: true,
        artifactReadBackPassed: true,
        realtimeRefreshEquivalent: true,
        productionReplayPassed: true,
        browserJourneysPassed: true,
        noRawPayloadFallback: true,
      },
      flags: { item_dual_write: true },
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("flag:unified_production_cutover");
  });

  it("halts canary expansion on deterministic safety regressions", () => {
    const result = evaluateAgentCanaryMetrics({
      runCreateErrorRate: 0,
      duplicateRunCount: 0,
      duplicateItemCount: 0,
      waitingUserStallRate: 0,
      gateRecoveryRate: 1,
      programFailureRate: 0,
      projectionDiffRate: 0.01,
      rawPayloadFallbackCount: 0,
      artifactReadBackFailureCount: 0,
    });
    expect(result.healthy).toBe(false);
    expect(result.violations).toContain("projection_diff");
  });

  it("requires replacement ownership and replay evidence before legacy removal", () => {
    expect(canRemoveAgentLegacyPath({
      legacyPath: "client-runner",
      replacementOwner: "durable-orchestrator-engine",
      coveredFixtures: ["101-120"],
      removedFlags: ["item_read_switch"],
      staticReachabilityCheck: true,
      releaseReplayPassed: true,
    })).toBe(true);
  });
});
