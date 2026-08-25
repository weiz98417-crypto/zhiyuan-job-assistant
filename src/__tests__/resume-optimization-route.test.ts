import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  optimizeResumeSectionForAgent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: boundaries.getCurrentUser }));
vi.mock("@/lib/server/resume-optimization-service", () => ({
  optimizeResumeSectionForAgent: boundaries.optimizeResumeSectionForAgent,
}));

import { POST } from "@/app/api/cv/optimize-section/route";

describe("resume optimization route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundaries.getCurrentUser.mockResolvedValue({ userId: "user-1" });
  });

  it("delegates generation and durable draft persistence to one shared service", async () => {
    boundaries.optimizeResumeSectionForAgent.mockResolvedValue({
      sectionId: "experience",
      artifactId: "artifact-1",
      baseVersion: "v3",
      baseHash: "hash-1",
      variants: [{ id: "draft-1", variantId: "results", label: "结果导向版", approach: "quantify", content: "负责 Agent 项目并提升转化率 20%。" }],
      readBackVerified: true,
      referenceMemory: { snippetIds: [2] },
    });
    const request = new Request("http://localhost/api/cv/optimize-section", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "optimize-1" },
      body: JSON.stringify({
        sectionId: "experience",
        intent: "更突出结果",
        operation: "quantify",
        effort: 4,
        targetJD: { role: "AI 产品经理", company: "甲公司", keywords: ["Agent"] },
        referenceIds: [2],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { artifactId: "artifact-1", readBackVerified: true, variants: [{ id: "draft-1", placeholderCount: 0 }] },
    });
    expect(boundaries.optimizeResumeSectionForAgent).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({
        sectionId: "experience",
        operation: "quantify",
        effort: 4,
        jdText: expect.stringContaining("AI 产品经理"),
        requestKey: "optimize-1",
      }),
      { signal: request.signal },
    );
  });
});
