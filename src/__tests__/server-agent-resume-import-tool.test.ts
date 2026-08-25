import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({ importResumeTextForAgent: vi.fn() }));

vi.mock("@/lib/server/resume-import-service", () => ({
  importResumeTextForAgent: boundaries.importResumeTextForAgent,
  ResumeImportInputError: class extends Error {},
}));

import { importResume } from "@/lib/agent/tools/action/import-resume";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  allowlist: ["import_resume"],
  signal: new AbortController().signal,
};

describe("server resume import tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("legacy HTTP must not be used"));
  });

  it("parses and persists resume text through the principal-scoped intake module", async () => {
    boundaries.importResumeTextForAgent.mockResolvedValue({
      sections: { summary: "概述", experience: "经历", projects: "项目", skills: "技能", education: "教育" },
      integrity: { status: "valid" },
      persisted: {
        documentId: "resume-1",
        versionId: "v2",
        status: "active",
        cvData: {},
        readBackVerified: true,
      },
    });
    const result = await importResume.handler({ text: "完整简历文本".repeat(30), source: "paste" }, context);
    expect(result).toMatchObject({ success: true, data: { persisted: { readBackVerified: true } } });
    expect(boundaries.importResumeTextForAgent).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ source: "paste" }),
      { signal: context.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
