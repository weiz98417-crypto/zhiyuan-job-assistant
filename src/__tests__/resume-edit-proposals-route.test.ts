import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeEditProposalRecord } from "@/lib/agent/resume-edit-proposals";

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
});
