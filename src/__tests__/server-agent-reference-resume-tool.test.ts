import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({ saveReferenceResumeForAgent: vi.fn() }));

vi.mock("@/lib/server/reference-resume-service", () => ({
  saveReferenceResumeForAgent: boundaries.saveReferenceResumeForAgent,
}));

import { saveReferenceResume } from "@/lib/agent/tools/action/save-reference-resume";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  allowlist: ["save_reference_resume"],
  signal: new AbortController().signal,
};

describe("server reference resume tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("legacy HTTP must not be used"));
  });

  it("saves and verifies a principal-scoped reference resume", async () => {
    boundaries.saveReferenceResumeForAgent.mockResolvedValue({
      id: 9,
      name: "AI 产品经理参考简历",
      roleCategory: "AI产品经理",
      visibility: "private",
      qualityScore: 0.8,
      readBackVerified: true,
      indexing: { status: "embedded", chunks: 2, embedded: 2, failed: 0 },
      patternMemory: { status: "persisted", extracted: 2, persisted: 2 },
    });
    const result = await saveReferenceResume.handler({
      resume_text: "姓名 张三\n工作经历 示例科技 产品经理 2023-2026\n项目经验 AI 助手，提升转化率 20%\n技能 SQL、产品设计\n教育背景 本科".repeat(3),
      role_category: "AI产品经理",
    }, context);
    expect(result).toMatchObject({ success: true, data: { id: 9, readBackVerified: true } });
    expect(boundaries.saveReferenceResumeForAgent).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ roleCategory: "AI产品经理" }),
      { signal: context.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
