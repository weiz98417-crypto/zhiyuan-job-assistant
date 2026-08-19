import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeEditProposalRecord } from "@/lib/agent/resume-edit-proposals";
import type { ResumeDraftRecord } from "@/lib/resume/document";
import { stableContentHash } from "@/lib/agent/verified-action";

const TEST_USER = {
  userId: "user-proposals",
  username: "proposal-user",
  role: "member",
  tokenVersion: 0,
};

function proposal(overrides: Partial<ResumeEditProposalRecord> = {}): ResumeEditProposalRecord {
  return {
    id: "rep-latest-applied",
    user_id: TEST_USER.userId,
    section_id: "skills",
    base_version: "v1",
    base_hash: "fnv1a32:base",
    original_content: "Old skills",
    proposed_content: "New skills",
    proposed_hash: "fnv1a32:new",
    reason: "user approved draft",
    risk_flags_json: "[]",
    status: "applied",
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:10:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/data-repositories");
});

describe("resume edit proposals route", () => {
  it("lists the latest applied proposal for the rollback affordance", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => TEST_USER,
    }));
    const listByStatus = vi.fn(async () => [proposal()]);
    const listPending = vi.fn(async () => []);
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({
        resumeEditProposals: {
          listPending,
          listByStatus,
        },
      }),
    }));
    const route = await import("@/app/api/cv/edit-proposals/route");

    const response = await route.GET(new Request("http://localhost/api/cv/edit-proposals?status=applied&limit=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).toMatchObject({
      id: "rep-latest-applied",
      sectionId: "skills",
      status: "applied",
    });
    expect(listPending).not.toHaveBeenCalled();
    expect(listByStatus).toHaveBeenCalledWith(TEST_USER.userId, "applied", 1);
  });

  it("keeps the default pending proposal list behavior", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => TEST_USER,
    }));
    const listPending = vi.fn(async () => [proposal({ id: "rep-pending", status: "pending" })]);
    const listByStatus = vi.fn(async () => []);
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({
        resumeEditProposals: {
          listPending,
          listByStatus,
        },
      }),
    }));
    const route = await import("@/app/api/cv/edit-proposals/route");

    const response = await route.GET(new Request("http://localhost/api/cv/edit-proposals"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data[0]).toMatchObject({ id: "rep-pending", status: "pending" });
    expect(listPending).toHaveBeenCalledWith(TEST_USER.userId);
    expect(listByStatus).not.toHaveBeenCalled();
  });

  it("creates a proposal from the persisted draft instead of chat-supplied content", async () => {
    const active = {
      sections: [
        { id: "experience", title: "工作经历", content: "旧工作经历" },
        { id: "skills", title: "技能", content: "旧技能清单" },
      ],
    };
    const draftContent = "核心能力\nAI 产品全链路设计\nAgent 评测\nRAG 知识库构建";
    const draft: ResumeDraftRecord = {
      id: "draft-persisted-1",
      user_id: TEST_USER.userId,
      document_id: "resume-v3",
      artifact_id: "draft-artifact-1",
      variant_id: "complete",
      title: "完整方案",
      status: "draft",
      base_version: "v3",
      base_hash: stableContentHash(active),
      patches_json: JSON.stringify([{
        sectionId: "skills",
        originalContent: "旧技能清单",
        proposedContent: draftContent,
      }]),
      content_json: JSON.stringify({ sectionId: "skills", content: draftContent }),
      integrity_json: JSON.stringify({ valid: true }),
    };
    const create = vi.fn(async (input: {
      sectionId: "skills";
      baseVersion: string;
      baseHash: string;
      originalContent: string;
      proposedContent: string;
      reason?: string;
      riskFlags?: string[];
    }) => proposal({
      id: "rep-from-draft",
      status: "pending",
      section_id: input.sectionId,
      base_version: input.baseVersion,
      base_hash: input.baseHash,
      original_content: input.originalContent,
      proposed_content: input.proposedContent,
      proposed_hash: stableContentHash(input.proposedContent),
      reason: input.reason || "",
      risk_flags_json: JSON.stringify(input.riskFlags || []),
    }));
    const updateStatus = vi.fn(async () => ({ ...draft, status: "selected" as const }));

    vi.doMock("@/lib/auth", () => ({ getCurrentUser: async () => TEST_USER }));
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({
        cv: {
          get: async () => ({ data_json: JSON.stringify({ activeVersion: "v3", versions: { v3: active } }) }),
        },
        resumeDrafts: {
          get: async (id: string, userId: string) => id === draft.id && userId === TEST_USER.userId ? draft : undefined,
          updateStatus,
        },
        resumeEditProposals: { create },
      }),
    }));
    const route = await import("@/app/api/cv/edit-proposals/route");

    const response = await route.POST(new Request("http://localhost/api/cv/edit-proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId: draft.id,
        sectionId: "experience",
        proposedContent: "聊天中不可信且不完整的正文",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: "rep-from-draft",
      draftId: draft.id,
      artifactId: draft.artifact_id,
      sectionId: "skills",
      proposedContent: draftContent,
      riskFlags: ["persistent_draft"],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sectionId: "skills",
      proposedContent: draftContent,
      originalContent: "旧技能清单",
      baseVersion: "v3",
      baseHash: draft.base_hash,
    }), TEST_USER.userId);
    expect(updateStatus).toHaveBeenCalledWith(draft.id, "selected", TEST_USER.userId);
  });
});
