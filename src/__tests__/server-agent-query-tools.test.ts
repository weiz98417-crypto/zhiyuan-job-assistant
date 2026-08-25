import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assembleAgentMemoryContext,
  getCurrentResume,
  getJd,
  getPipelineStatus,
  getProfile,
  getProfileDnaSummary,
  getReferenceResume,
  listApplications,
  listReferenceResumes,
  listJds,
  readProjectFile,
} = vi.hoisted(() => ({
  assembleAgentMemoryContext: vi.fn(),
  getCurrentResume: vi.fn(),
  getJd: vi.fn(),
  getPipelineStatus: vi.fn(),
  getProfile: vi.fn(),
  getProfileDnaSummary: vi.fn(),
  getReferenceResume: vi.fn(),
  listApplications: vi.fn(),
  listReferenceResumes: vi.fn(),
  listJds: vi.fn(),
  readProjectFile: vi.fn(),
}));

vi.mock("@/lib/agent/runtime/agent-read-service", () => ({
  getAgentReadService: () => ({
    getCurrentResume,
    getJd,
    getPipelineStatus,
    getProfile,
    getProfileDnaSummary,
    getReferenceResume,
    listApplications,
    listReferenceResumes,
    listJds,
    readProjectFile,
  }),
}));

vi.mock("@/lib/agent/memory-context", () => ({ assembleAgentMemoryContext }));

import { getPipelineStatus as getPipelineStatusTool } from "@/lib/agent/tools/query/get-pipeline-status";
import { getProfile as getProfileTool } from "@/lib/agent/tools/query/get-profile";
import { getRecentJDContext } from "@/lib/agent/tools/query/get-recent-jd-context";
import { getReferenceDetail } from "@/lib/agent/tools/query/get-reference-detail";
import { readFile } from "@/lib/agent/tools/query/read-file";
import { searchApplications } from "@/lib/agent/tools/query/search-applications";

describe("server Agent query tools", () => {
  beforeEach(() => {
    assembleAgentMemoryContext.mockReset();
    getCurrentResume.mockReset();
    getJd.mockReset();
    getPipelineStatus.mockReset();
    getProfile.mockReset();
    getProfileDnaSummary.mockReset();
    getReferenceResume.mockReset();
    listApplications.mockReset();
    listReferenceResumes.mockReset();
    listJds.mockReset();
    readProjectFile.mockReset();
    vi.unstubAllGlobals();
  });

  it("reads allowlisted project files directly inside the Worker", async () => {
    readProjectFile.mockResolvedValue({
      content: "第一行\n第二行\n第三行",
      truncated: false,
      charCount: 11,
      source: "fs",
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await readFile.handler(
      { path: "CONTEXT.md", offset: 2, limit: 1 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["read_file"],
      },
    );

    expect(result).toMatchObject({ success: true, errorCategory: "ok" });
    expect(result.llmSummary).toContain("第二行");
    expect(readProjectFile).toHaveBeenCalledWith("CONTEXT.md");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads reference resume detail through the principal-scoped service", async () => {
    getReferenceResume.mockResolvedValue({
      id: 9,
      name: "优秀产品简历",
      source: "upload",
      sections: [{ id: "experience", title: "工作经历", content: "负责 Agent 产品" }],
      tags: ["AI"],
      notes: "",
      ownedByUser: true,
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await getReferenceDetail.handler(
      { id: 9 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_reference_detail"],
      },
    );

    expect(result.success).toBe(true);
    expect(result.llmSummary).toContain("负责 Agent 产品");
    expect(getReferenceResume).toHaveBeenCalledWith({ userId: "user-1" }, 9);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads a saved JD and its memory context without localhost HTTP", async () => {
    getJd.mockResolvedValue({
      id: 5,
      company: "甲公司",
      role: "AI 产品经理",
      body: "负责 Agent 产品",
      reportId: 12,
      createdAt: "2026-08-24T10:00:00.000Z",
    });
    assembleAgentMemoryContext.mockResolvedValue({
      task: "jd_evaluation",
      structuredFacts: [],
      semanticSnippets: [],
      warnings: [],
      llmSummary: "历史评估强调交付证据",
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call localhost HTTP");
    }));

    const result = await getRecentJDContext.handler(
      { jdId: 5 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_recent_jd_context"],
      },
    );

    expect(result.success).toBe(true);
    expect(result.llmSummary).toContain("负责 Agent 产品");
    expect(result.llmSummary).toContain("历史评估强调交付证据");
    expect(getJd).toHaveBeenCalledWith({ userId: "user-1" }, 5);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads profile, resume, references, and memory without browser APIs", async () => {
    getProfileDnaSummary.mockResolvedValue("目标岗位: AI 产品经理");
    getProfile.mockResolvedValue({
      data: {},
      goals: { targetRoles: [{ role: "AI 产品经理", level: "高级" }] },
      history: [],
      lastUpdated: "2026-08-24T10:00:00.000Z",
    });
    getCurrentResume.mockResolvedValue({
      activeVersion: "v3",
      versions: { v3: { sections: [{ id: "summary", title: "概述", content: "候选人甲" }] } },
    });
    listReferenceResumes.mockResolvedValue([{ id: 2, name: "参考简历", tags: ["AI"] }]);
    assembleAgentMemoryContext.mockResolvedValue({
      task: "profile_growth",
      structuredFacts: [],
      semanticSnippets: [],
      warnings: [],
      llmSummary: "偏好 Agent 产品",
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await getProfileTool.handler(
      {},
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_profile"],
      },
    );

    expect(result.success).toBe(true);
    expect(result.llmSummary).toContain("AI 产品经理(高级)");
    expect(result.llmSummary).toContain("偏好 Agent 产品");
    expect(getProfile).toHaveBeenCalledWith({ userId: "user-1" });
    expect(assembleAgentMemoryContext).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the current resume directly for a durable Worker execution", async () => {
    getCurrentResume.mockResolvedValue({
      activeVersion: "v3",
      versions: {
        v3: {
          sections: [{ id: "experience", title: "工作经历", content: "负责 Agent 产品设计" }],
        },
      },
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await readFile.handler(
      { path: "我的简历" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["read_file"],
      },
    );

    expect(result).toMatchObject({
      success: true,
      errorCategory: "ok",
      data: { source: "cv", activeVersion: "v3" },
    });
    expect(result.llmSummary).toContain("负责 Agent 产品设计");
    expect(getCurrentResume).toHaveBeenCalledWith({ userId: "user-1" }, { includeSource: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the execution principal instead of relative HTTP for application search", async () => {
    listApplications.mockResolvedValue([
      { num: 12, company: "甲公司", role: "产品经理", score: 4, status: "applied", date: "2026-08-24", report_path: "" },
    ]);
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await searchApplications.handler(
      { company: "甲", limit: 5 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["search_applications"],
      },
    );

    expect(result.success).toBe(true);
    expect(listApplications).toHaveBeenCalledWith(
      { userId: "user-1" },
      { company: "甲", limit: 5 },
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("derives pipeline status through the principal-scoped service", async () => {
    getPipelineStatus.mockResolvedValue({
      total: 3,
      byStatus: { applied: 2, interview: 1 },
      avgScore: 4.3,
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await getPipelineStatusTool.handler(
      { status: "applied", date_from: "2026-08-01" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_pipeline_status"],
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: { total: 3, avgScore: 4.3 },
      errorCategory: "ok",
    });
    expect(getPipelineStatus).toHaveBeenCalledWith(
      { userId: "user-1" },
      { status: "applied", date_from: "2026-08-01" },
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
