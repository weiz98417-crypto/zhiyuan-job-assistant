import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeDraftRecord } from "@/lib/resume/document";
import { stableContentHash } from "@/lib/agent/verified-action";

const TEST_USER = {
  userId: "user-resume-drafts",
  username: "resume-draft-user",
  role: "member",
  tokenVersion: 0,
};

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/data-repositories");
});

describe("resume drafts route", () => {
  it("persists complete variants and reads them back by artifact id", async () => {
    const originalContent = "旧技能清单\n产品规划\n用户研究";
    const longDraft = `核心能力\n${"AI 产品架构、Agent 评测与业务交付。".repeat(420)}`;
    const active = {
      sections: [
        { id: "summary", title: "个人概述", content: "AI 产品经理" },
        { id: "skills", title: "技能", content: originalContent },
      ],
    };
    const records: ResumeDraftRecord[] = [];
    const createArtifact = vi.fn(async (inputs: ResumeDraftRecord[], userId: string) => {
      const created = inputs.map((input) => ({
          ...input,
          user_id: userId,
          created_at: "2026-08-19T00:00:00.000Z",
          updated_at: "2026-08-19T00:00:00.000Z",
        }));
      records.push(...created);
      return created;
    });
    const listByArtifact = vi.fn(async (artifactId: string, userId: string) => (
      records.filter((record) => record.artifact_id === artifactId && record.user_id === userId)
    ));

    vi.doMock("@/lib/auth", () => ({ getCurrentUser: async () => TEST_USER }));
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({
        cv: {
          get: async () => ({
            data_json: JSON.stringify({ activeVersion: "v7", versions: { v7: active } }),
          }),
        },
        resumeDocuments: { getActive: async () => ({ id: "resume-document-v7" }) },
        resumeDrafts: {
          createArtifact,
          get: async (id: string, userId: string) => records.find((record) => record.id === id && record.user_id === userId),
          listByArtifact,
        },
      }),
    }));
    const route = await import("@/app/api/cv/drafts/route");

    const response = await route.POST(new Request("http://localhost/api/cv/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sectionId: "skills",
        variants: [
          { variantId: "complete", label: "完整方案", content: longDraft, approach: "保留全部事实" },
          { variantId: "focused", label: "聚焦方案", content: "核心能力\nAI 产品规划\nAgent 评测\n数据分析与用户研究" },
        ],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        sectionId: "skills",
        baseVersion: "v7",
        baseHash: stableContentHash(active),
        readBackVerified: true,
      },
    });
    expect(body.data.variants).toHaveLength(2);
    expect(body.data.variants[0].content).toBe(longDraft);
    expect(body.data.variants[0].content.length).toBeGreaterThan(5000);
    expect(createArtifact).toHaveBeenCalledTimes(1);
    expect(createArtifact.mock.calls[0][0]).toHaveLength(2);

    const readBackResponse = await route.GET(new Request(
      `http://localhost/api/cv/drafts?artifactId=${encodeURIComponent(body.data.artifactId)}`,
    ));
    const readBack = await readBackResponse.json();

    expect(readBackResponse.status).toBe(200);
    expect(readBack.success).toBe(true);
    expect(readBack.data[0].content).toBe(longDraft);
    expect(readBack.data[0].patches[0]).toMatchObject({
      sectionId: "skills",
      originalContent,
      proposedContent: longDraft,
    });
    expect(listByArtifact).toHaveBeenLastCalledWith(body.data.artifactId, TEST_USER.userId);
  });
});
