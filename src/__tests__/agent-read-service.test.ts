import { describe, expect, it, vi } from "vitest";
import { AgentReadService } from "@/lib/agent/runtime/agent-read-service";

describe("Agent read application service", () => {
  it("scopes application reads to the execution principal and derives pipeline statistics", async () => {
    const listApplications = vi.fn(async () => [
      { num: 1, date: "2026-08-23", company: "甲公司", role: "产品经理", status: "applied", score: 4, pdf_generated: 0, report_path: "", notes: "" },
      { num: 2, date: "2026-08-24", company: "乙公司", role: "AI 产品经理", status: "interview", score: 5, pdf_generated: 0, report_path: "", notes: "" },
    ]);
    const service = new AgentReadService({ listApplications });

    const applications = await service.listApplications(
      { userId: "user-1" },
      { status: "applied", limit: 20 },
    );
    const pipeline = await service.getPipelineStatus({ userId: "user-1" });

    expect(applications).toHaveLength(2);
    expect(listApplications).toHaveBeenNthCalledWith(
      1,
      { status: "applied", limit: 20 },
      "user-1",
    );
    expect(listApplications).toHaveBeenNthCalledWith(2, {}, "user-1");
    expect(pipeline).toEqual({
      total: 2,
      byStatus: { applied: 1, interview: 1 },
      avgScore: 4.5,
    });
  });

  it("builds the current resume projection from the principal's active document", async () => {
    const getCv = vi.fn(async () => ({
      data_json: JSON.stringify({ activeVersion: "legacy", versions: {} }),
    }));
    const getActiveResumeDocument = vi.fn(async () => ({
      id: "resume-1",
      version_id: "v3",
      label: "求职版",
      status: "active",
      sections_json: JSON.stringify([
        { id: "summary", title: "个人概述", content: "AI 产品经理" },
      ]),
      content_hash: "sha256:v3",
      integrity_json: JSON.stringify({ status: "verified" }),
    }));
    const getResumeArtifact = vi.fn(async () => ({
      id: "artifact-1",
      source_type: "upload",
      filename: "resume.pdf",
      mime_type: "application/pdf",
      source_hash: "source:v3",
      raw_text: "完整简历原文",
      extraction_json: JSON.stringify({ provider: "mineru" }),
    }));
    const listResumeChunks = vi.fn(async () => [{
      id: "chunk-1",
      chunk_index: 0,
      start_offset: 0,
      end_offset: 6,
      content: "完整简历原文",
      content_hash: "chunk:v3",
    }]);
    const service = new AgentReadService({
      listApplications: vi.fn(async () => []),
      getCv,
      getActiveResumeDocument,
      getResumeArtifact,
      listResumeChunks,
    });

    const resume = await service.getCurrentResume({ userId: "user-1" }, { includeSource: true });

    expect(resume).toMatchObject({
      activeVersion: "v3",
      versions: {
        v3: {
          label: "求职版",
          sections: [{ id: "summary", content: "AI 产品经理" }],
          integrityStatus: "verified",
        },
      },
      resumeDocument: {
        id: "resume-1",
        sourceText: "完整简历原文",
        sourceArtifact: { id: "artifact-1", filename: "resume.pdf" },
        chunks: [{ id: "chunk-1", index: 0 }],
      },
    });
    expect(getCv).toHaveBeenCalledWith("user-1");
    expect(getActiveResumeDocument).toHaveBeenCalledWith("user-1");
    expect(getResumeArtifact).toHaveBeenCalledWith("resume-1", "user-1");
  });

  it("parses the principal's profile into a stable read model", async () => {
    const getProfile = vi.fn(async () => ({
      id: 7,
      data_json: JSON.stringify({ headline: "AI 产品经理" }),
      goals_json: JSON.stringify({ targetRoles: [{ role: "AI 产品经理", level: "高级" }] }),
      history_json: JSON.stringify([{ event: "确认方向" }]),
      last_updated: "2026-08-24T10:00:00.000Z",
    }));
    const service = new AgentReadService({
      listApplications: vi.fn(async () => []),
      getProfile,
    });

    const profile = await service.getProfile({ userId: "user-1" });

    expect(profile).toEqual({
      data: { headline: "AI 产品经理" },
      goals: { targetRoles: [{ role: "AI 产品经理", level: "高级" }] },
      history: [{ event: "确认方向" }],
      lastUpdated: "2026-08-24T10:00:00.000Z",
    });
    expect(getProfile).toHaveBeenCalledWith("user-1");
  });

  it("returns only redacted sections for a shared reference resume owned by another user", async () => {
    const getReferenceResume = vi.fn(async () => ({
      id: 9,
      user_id: "user-2",
      name: "优秀产品简历",
      source: "upload",
      sections_json: JSON.stringify([{ id: "private", title: "隐私", content: "手机号 13800000000" }]),
      raw_text: "姓名张三，手机号 13800000000，负责 AI 产品",
      shared_text_redacted: "负责 AI 产品",
      tags: JSON.stringify(["AI 产品"]),
      notes: "内部备注",
      role_category: "product",
      visibility: "team",
      status: "active",
      quality_score: 88,
      anonymized: true,
      created_at: "2026-08-24T10:00:00.000Z",
    }));
    const service = new AgentReadService({
      listApplications: vi.fn(async () => []),
      getReferenceResume,
    });

    const resume = await service.getReferenceResume({ userId: "user-1" }, 9);

    expect(resume).toMatchObject({
      id: 9,
      ownedByUser: false,
      notes: "",
      sections: [{ id: "shared-summary", title: "共享摘要", content: "负责 AI 产品" }],
    });
    expect(JSON.stringify(resume)).not.toContain("13800000000");
    expect(getReferenceResume).toHaveBeenCalledWith(9, "user-1");
  });

  it("lists reference resume summaries without private document bodies", async () => {
    const listReferenceResumes = vi.fn(async () => [{
      id: 3,
      user_id: "user-1",
      name: "AI 产品简历",
      source: "upload",
      tags: JSON.stringify(["AI", "产品"]),
      notes: "可借鉴",
      role_category: "product",
      visibility: "private",
      status: "active",
      quality_score: 90,
      anonymized: false,
      created_at: "2026-08-24T10:00:00.000Z",
    }]);
    const service = new AgentReadService({
      listApplications: vi.fn(async () => []),
      listReferenceResumes,
    });

    const resumes = await service.listReferenceResumes({ userId: "user-1" });

    expect(resumes).toEqual([expect.objectContaining({
      id: 3,
      tags: ["AI", "产品"],
      ownedByUser: true,
    })]);
    expect(listReferenceResumes).toHaveBeenCalledWith("user-1");
    expect(JSON.stringify(resumes)).not.toContain("sections_json");
  });

  it("maps the principal's JD rows into the shared client and Worker read model", async () => {
    const listJds = vi.fn(async () => [{
      id: 5,
      user_id: "user-1",
      company: "甲公司",
      role: "AI 产品经理",
      source_type: "paste",
      source_url: "https://example.com/job/5",
      body: "负责 Agent 产品",
      keywords_json: JSON.stringify(["Agent", "RAG"]),
      report_id: 12,
      created_at: "2026-08-24T10:00:00.000Z",
    }]);
    const service = new AgentReadService({
      listApplications: vi.fn(async () => []),
      listJds,
    });

    const jds = await service.listJds({ userId: "user-1" });

    expect(jds).toEqual([{
      id: 5,
      company: "甲公司",
      role: "AI 产品经理",
      sourceType: "paste",
      sourceUrl: "https://example.com/job/5",
      body: "负责 Agent 产品",
      keywords: ["Agent", "RAG"],
      reportId: 12,
      createdAt: "2026-08-24T10:00:00.000Z",
    }]);
    expect(listJds).toHaveBeenCalledWith("user-1");
  });

  it("lists and reads evaluation reports only for the execution principal", async () => {
    const report = {
      report_num: 12,
      date: "2026-08-24",
      company: "甲公司",
      role: "AI 产品经理",
      archetype: "builder",
      overall_score: 4.5,
      legitimacy: "high",
      blocks_json: JSON.stringify({ a: { content: "职位概览", score: 4 } }),
      keywords_json: JSON.stringify(["Agent"]),
    };
    const listReports = vi.fn(async () => [report]);
    const getReport = vi.fn(async () => report);
    const service = new AgentReadService({
      listApplications: vi.fn(async () => []),
      listReports,
      getReport,
    });

    const reports = await service.listReports({ userId: "user-1" });
    const detail = await service.getReport({ userId: "user-1" }, 12);

    expect(reports).toEqual([report]);
    expect(detail).toEqual(report);
    expect(listReports).toHaveBeenCalledWith("user-1");
    expect(getReport).toHaveBeenCalledWith(12, "user-1");
  });

  it("reads an Offer report only for the execution principal", async () => {
    const row = { id: 7, summary: "值得推进", offer_snapshot_json: "{}" };
    const getOfferReport = vi.fn(async () => row);
    const service = new AgentReadService({
      listApplications: vi.fn(async () => []),
      getOfferReport,
    });

    const report = await service.getOfferReport({ userId: "user-1" }, 7);

    expect(report).toEqual(row);
    expect(getOfferReport).toHaveBeenCalledWith(7, "user-1");
  });

  it("reads only allowlisted project files and blocks path traversal", async () => {
    const service = new AgentReadService({ listApplications: vi.fn(async () => []) });

    const context = await service.readProjectFile("CONTEXT.md");

    expect(context.content).toContain("纸鸢求职助手");
    expect(context.source).toBe("fs");
    await expect(service.readProjectFile("../outside.md")).rejects.toThrow("不支持的文件路径");
    await expect(service.readProjectFile("package-lock.xml")).rejects.toThrow("不支持的文件类型");
  });
});
