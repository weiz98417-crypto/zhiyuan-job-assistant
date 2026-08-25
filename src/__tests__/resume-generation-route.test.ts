import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  generateResumeDraftForAgent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: boundaries.getCurrentUser }));
vi.mock("@/lib/server/resume-generation-service", () => ({
  generateResumeDraftForAgent: boundaries.generateResumeDraftForAgent,
}));

import { POST } from "@/app/api/cv/tailor/route";

describe("resume generation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundaries.getCurrentUser.mockResolvedValue({ userId: "user-1" });
  });

  it("creates durable selectable drafts from the canonical server resume", async () => {
    boundaries.generateResumeDraftForAgent.mockResolvedValue({
      artifactId: "artifact-cv-1",
      baseVersion: "v3",
      baseHash: "hash-v3",
      drafts: [{ id: "draft-summary", sectionId: "summary", label: "summary 定制版", content: "AI 产品经理" }],
      readBackVerified: true,
    });
    const jdText = "负责 Agent 产品规划、评测体系和商业化落地，要求具备跨团队协作与数据分析能力。".repeat(2);
    const request = new Request("http://localhost/api/cv/tailor", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "tailor-1" },
      body: JSON.stringify({ sections: { summary: "客户端旧快照" }, jdText, targetRole: "AI 产品经理" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { artifactId: "artifact-cv-1", readBackVerified: true } });
    expect(boundaries.generateResumeDraftForAgent).toHaveBeenCalledWith(
      { userId: "user-1" },
      { jdText, targetRole: "AI 产品经理", language: undefined, referenceIds: undefined, requestKey: "tailor-1" },
      { signal: request.signal },
    );
  });
});
