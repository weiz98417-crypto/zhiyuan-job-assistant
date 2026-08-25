import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({ optimizeResumeSectionForAgent: vi.fn() }));

vi.mock("@/lib/server/resume-optimization-service", () => ({
  optimizeResumeSectionForAgent: boundaries.optimizeResumeSectionForAgent,
  ResumeOptimizationInputError: class extends Error {},
}));

import { optimizeResumeSection } from "@/lib/agent/tools/action/optimize-resume-section";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  requestId: "request-1",
  allowlist: ["optimize_resume_section"],
  signal: new AbortController().signal,
};

describe("server resume optimization tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("legacy HTTP must not be used"));
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => { throw new Error("browser state must not be used"); }) });
  });

  it("generates and persists principal-scoped resume drafts", async () => {
    boundaries.optimizeResumeSectionForAgent.mockResolvedValue({
      sectionId: "experience",
      artifactId: "artifact-1",
      baseVersion: "v1",
      baseHash: "base-1",
      variants: [{ id: "draft-1", label: "量化版", approach: "quantify" }],
      readBackVerified: true,
    });
    const result = await optimizeResumeSection.handler({
      section: "工作经历",
      instruction: "突出量化结果",
    }, context);
    expect(result).toMatchObject({ success: true, data: { artifactId: "artifact-1", draftIds: ["draft-1"] } });
    expect(boundaries.optimizeResumeSectionForAgent).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ sectionId: "experience", requestKey: "request-1" }),
      { signal: context.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem).not.toHaveBeenCalled();
  });
});
