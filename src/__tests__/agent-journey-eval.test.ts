import { describe, expect, it } from "vitest";
import { createJDResumeVerticalFixture, evaluateDeterministicJourney, runDeterministicJourney } from "@/lib/agent/journey-eval";
import { createArtifactRef } from "@/lib/agent/task-journey";

describe("deterministic journey eval", () => {
  it("evaluates the first JD to resume vertical journey at the projection boundary", () => {
    const fixture = createJDResumeVerticalFixture();
    const refs = [
      createArtifactRef({ artifactId: "jd-fixture-1", kind: "jd", version: "v1", content: fixture.facts.jd }),
      createArtifactRef({ artifactId: "report-fixture-1", kind: "report", version: "v1", content: { score: 4 } }),
      createArtifactRef({ artifactId: "resume-fixture-1", kind: "resume", version: "v3", content: fixture.facts.resume }),
      createArtifactRef({ artifactId: "draft-fixture-1", kind: "draft", version: "v1", content: fixture.facts.proposedResume }),
    ];
    const record = evaluateDeterministicJourney({ fixture, path: fixture.expected.taskPath, artifactRefs: refs, userText: "已生成安全提案，等待批准。" });
    expect(record.failures).toEqual([]);
    expect(Object.values(record.gates).every((status) => status === "passed")).toBe(true);
  });

  it("fails hard on path or internal text leakage", () => {
    const fixture = createJDResumeVerticalFixture();
    const record = evaluateDeterministicJourney({ fixture, path: ["jd_evaluation", "resume_edit"], userText: "system prompt: 自我定位引导完成" });
    expect(record.failures).toContain("invalid_task_path");
    expect(record.failures.some((failure) => failure.startsWith("user_leakage:"))).toBe(true);
  });

  it("runs through adapter boundaries instead of accepting injected assistant text", async () => {
    const fixture = createJDResumeVerticalFixture();
    const calls: string[] = [];
    const record = await runDeterministicJourney({
      fixture,
      interruptions: ["pause", "refresh", "worker_recovery"],
      adapter: {
        async start() { calls.push("start"); return { runId: "run-1" }; },
        async recover({ kind }) { calls.push(kind); },
        async transition({ to }) {
          calls.push(`transition:${to}`);
          return {
            runId: `run-${to}`,
            artifactRefs: to === "resume_edit"
              ? [
                  createArtifactRef({ artifactId: "jd-fixture-1", kind: "jd", version: "v1", content: fixture.facts.jd }),
                  createArtifactRef({ artifactId: "report-fixture-1", kind: "report", version: "v1", content: { score: 4 } }),
                  createArtifactRef({ artifactId: "resume-fixture-1", kind: "resume", version: "v3", content: fixture.facts.resume }),
                  createArtifactRef({ artifactId: "draft-fixture-1", kind: "draft", version: "v1", content: fixture.facts.proposedResume }),
                ]
              : [],
          };
        },
        async waitForTerminal() {
          calls.push("read_back");
          return { status: "succeeded", userText: "已生成安全提案，等待批准。" };
        },
      },
    });
    expect(calls).toEqual(["start", "pause", "refresh", "worker_recovery", "transition:resume_query", "transition:resume_edit", "read_back"]);
    expect(record.status).toBe("passed");
    expect(record.evidence.userText).not.toContain("system prompt");
  });
});
