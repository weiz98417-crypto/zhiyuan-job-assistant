import { describe, expect, it } from "vitest";
import {
  aggregateAgentReleaseGates,
  replayConversationItemFixture,
  type AgentReleaseManifest,
} from "@/lib/agent/eval-release-gates";

const manifest: AgentReleaseManifest = {
  version: "release-v1",
  codeCommit: "abc123",
  programVersions: { jd_evaluation: "v1" },
  entries: [{
    module: "item-projection",
    program: "jd_evaluation",
    requiredLayers: ["A", "D"],
    fixtureIds: ["fixture-1"],
    commandCategories: ["projection"],
    environment: "unit",
    owner: "agent-platform",
  }],
};

describe("agent eval release gates", () => {
  it("treats deterministic failures and missing required layers as hard failures", () => {
    const result = aggregateAgentReleaseGates({
      manifest,
      results: [{ layer: "A", passed: false, deterministic: true, failures: ["owner_scope"] }],
    });
    expect(result.passed).toBe(false);
    expect(result.hardFailures).toContain("A:owner_scope");
    expect(result.missingEvidence).toContain("layer_missing:D");
  });

  it("keeps quality warnings separate from deterministic release gates", () => {
    const result = aggregateAgentReleaseGates({
      manifest,
      results: [
        { layer: "A", passed: true, deterministic: true, failures: [] },
        { layer: "D", passed: false, deterministic: false, score: 0.4, failures: ["quality"] },
      ],
      minimumQualityScore: 0.8,
    });
    expect(result.passed).toBe(true);
    expect(result.hardFailures).toEqual([]);
    expect(result.qualityWarnings).toEqual(expect.arrayContaining(["D:quality", "D:quality_below_threshold"]));
  });

  it("replays a projection fixture deterministically", () => {
    const replay = replayConversationItemFixture({
      conversationId: 1,
      runId: "run-1",
      events: [{
        runId: "run-1", sequence: 1, type: "run.ui_event", payload: { event: { type: "text", content: "已完成" } }, createdAt: "2026-01-01T00:00:00.000Z",
      }],
    });
    expect(replay.replayStable).toBe(true);
    expect(replay.items[0]?.type).toBe("assistant_text");
  });
});
