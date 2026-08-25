import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({ generateResumeDraftForAgent: vi.fn() }));

vi.mock("@/lib/server/resume-generation-service", () => ({
  generateResumeDraftForAgent: boundaries.generateResumeDraftForAgent,
  ResumeGenerationInputError: class extends Error {},
}));

import { generateCV } from "@/lib/agent/tools/action/generate-cv";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  requestId: "request-1",
  allowlist: ["generate_cv"],
  signal: new AbortController().signal,
};

describe("server CV generation tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("legacy HTTP must not be used"));
  });

  it("persists generated sections as selectable resume drafts", async () => {
    boundaries.generateResumeDraftForAgent.mockResolvedValue({
      artifactId: "artifact-1",
      baseVersion: "v1",
      baseHash: "base-1",
      drafts: [{ id: "draft-summary", sectionId: "summary", label: "定制概述" }],
      readBackVerified: true,
    });
    const result = await generateCV.handler({ jdText: "完整 JD".repeat(30), targetRole: "AI 产品经理" }, context);
    expect(result).toMatchObject({ success: true, data: { artifactId: "artifact-1", readBackVerified: true } });
    expect(boundaries.generateResumeDraftForAgent).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ requestKey: "request-1", targetRole: "AI 产品经理" }),
      { signal: context.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
