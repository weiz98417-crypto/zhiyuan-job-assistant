import { describe, expect, it } from "vitest";
import { normalizeEvalRun, normalizeEvalRunMode, normalizeEvalRunStatus } from "@/lib/agent/eval-runs";

describe("agent eval run projection", () => {
  it("normalizes version metadata and redacts evidence payloads", () => {
    const record = normalizeEvalRun({
      id: "eval-1",
      mode: "unknown",
      status: "unknown",
      fixture_id: "fixture-1",
      fixture_version: "v1",
      graph_version: "task-journey/v1",
      hard_gate_passed: true,
      score: 9,
      gate_results_json: { readBack: "passed", prompt: "system prompt" },
      failure_evidence_json: [{ message: "Bearer abcdefghijklmnopqrst" }],
      metadata_json: { token: "secret" },
    });
    expect(record.mode).toBe("deterministic");
    expect(record.status).toBe("running");
    expect(record.score).toBe(1);
    expect(JSON.stringify(record)).not.toContain("system prompt");
    expect(JSON.stringify(record)).not.toContain("secret");
  });

  it("keeps only the supported mode and status vocabulary", () => {
    expect(normalizeEvalRunMode("staging")).toBe("staging");
    expect(normalizeEvalRunMode("release")).toBe("release");
    expect(normalizeEvalRunStatus("passed")).toBe("passed");
    expect(normalizeEvalRunStatus("flaky")).toBe("flaky");
  });
});
