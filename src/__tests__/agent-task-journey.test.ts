import { describe, expect, it } from "vitest";
import type { AgentTaskType } from "@/lib/agent/task-contract";
import {
  createArtifactRef,
  generateBoundedTaskPaths,
  isArtifactStale,
  isLegalTaskTransition,
  listTaskTransitionRules,
  resolveTaskTransition,
} from "@/lib/agent/task-journey";

describe("task journey graph and artifact references", () => {
  it("accepts legal JD to resume edit and rejects an illegal jump", () => {
    expect(isLegalTaskTransition("jd_evaluation", "resume_edit")).toBe(true);
    expect(isLegalTaskTransition("offer_evaluation", "resume_edit")).toBe(false);
  });

  it("forwards immutable artifacts and enforces confirmation for write transitions", () => {
    const jd = createArtifactRef({ artifactId: "jd-1", kind: "jd", version: 2, content: "JD body" });
    const report = createArtifactRef({ artifactId: "report-1", kind: "report", version: 1, content: { score: 4 } });
    const resume = createArtifactRef({ artifactId: "resume-1", kind: "resume", version: 1, content: "resume body" });
    const draft = createArtifactRef({ artifactId: "draft-1", kind: "draft", version: 1, content: "draft body" });
    const blocked = resolveTaskTransition({ from: "resume_edit", to: "jd_evaluation", artifacts: [jd, report, resume, draft] });
    expect(blocked.allowed).toBe(false);
    const allowed = resolveTaskTransition({ from: "resume_edit", to: "jd_evaluation", artifacts: [jd, report, resume, draft], confirmed: true });
    expect(allowed.allowed).toBe(true);
    expect(allowed.forwardedArtifacts.map((artifact) => artifact.artifactId)).toEqual(["jd-1", "report-1", "resume-1", "draft-1"]);
  });

  it("marks changed artifact versions or content as stale", () => {
    const reference = createArtifactRef({ artifactId: "resume-1", kind: "resume", version: 1, content: "old" });
    expect(isArtifactStale(reference, { version: 1, content: "new" })).toBe(true);
    expect(isArtifactStale(reference, { version: 1, content: "old" })).toBe(false);
  });

  it("generates bounded replayable paths without unbounded cycles", () => {
    const paths = generateBoundedTaskPaths({ start: "jd_evaluation" as AgentTaskType, maxDepth: 3 });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.length <= 3)).toBe(true);
  });

  it("locks the complete direct-edge and bounded long-journey inventory", () => {
    const directEdges = listTaskTransitionRules();
    const depthTwo = generateBoundedTaskPaths({ maxDepth: 2 });
    const depthThree = generateBoundedTaskPaths({ maxDepth: 3 });
    const depthFour = generateBoundedTaskPaths({ maxDepth: 4 });

    expect(directEdges).toHaveLength(43);
    expect(depthTwo).toHaveLength(43);
    expect(depthThree).toHaveLength(193);
    expect(depthFour).toHaveLength(699);
    expect(depthFour.every((path) => (
      path.slice(1).every((taskType, index) => isLegalTaskTransition(path[index], taskType))
    ))).toBe(true);
  });
});
