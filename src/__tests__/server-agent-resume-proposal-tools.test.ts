import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  createResumeEditProposalForUser: vi.fn(),
  applyResumeEditProposalForUser: vi.fn(),
  discardResumeEditProposalForUser: vi.fn(),
  rollbackResumeEditProposalForUser: vi.fn(),
}));

vi.mock("@/lib/server/resume-edit-proposal-service", () => service);

import { createResumeEditProposal } from "@/lib/agent/tools/action/create-resume-edit-proposal";
import { applyResumeEditProposal } from "@/lib/agent/tools/action/apply-resume-edit-proposal";
import { discardResumeEditProposal } from "@/lib/agent/tools/action/discard-resume-edit-proposal";
import { rollbackResumeEditProposal } from "@/lib/agent/tools/action/rollback-resume-edit-proposal";
import { saveResumeSection } from "@/lib/agent/tools/action/save-resume-section";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  allowlist: [
    "create_resume_edit_proposal",
    "apply_resume_edit_proposal",
    "discard_resume_edit_proposal",
    "rollback_resume_edit_proposal",
  ],
};

describe("resume proposal tools server execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("HTTP must not be used"));
  });

  it("creates a principal-scoped proposal with read-back evidence", async () => {
    service.createResumeEditProposalForUser.mockResolvedValue({
      id: "rep-1",
      sectionId: "skills",
      proposedContent: "AI 产品设计\nRAG 知识库\n数据分析",
      proposedHash: "hash-1",
      baseHash: "base-1",
      baseVersion: "v1",
      status: "pending",
      readBackVerified: true,
    });

    const result = await createResumeEditProposal.handler({
      section: "技能",
      proposedContent: "AI 产品设计\nRAG 知识库\n数据分析",
    }, context);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(service.createResumeEditProposalForUser).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ sectionId: "skills" }),
    );
    expect(result).toMatchObject({ success: true, data: { readBackVerified: true } });
  });

  it.each([
    ["apply", applyResumeEditProposal, service.applyResumeEditProposalForUser, "appliedContent"],
    ["discard", discardResumeEditProposal, service.discardResumeEditProposalForUser, "proposal"],
    ["rollback", rollbackResumeEditProposal, service.rollbackResumeEditProposalForUser, "restoredContent"],
  ])("runs %s through the principal-scoped transaction module", async (_name, tool, operation, contentKey) => {
    const serviceResult = {
      proposal: { id: "rep-1", status: _name === "discard" ? "discarded" : _name === "apply" ? "applied" : "rolled_back" },
      sectionId: "skills",
      readBackVerified: true,
      ...(contentKey === "proposal" ? {} : { [contentKey]: "verified content" }),
    };
    operation.mockResolvedValue(serviceResult);

    const result = await tool.handler({ proposalId: "rep-1" }, context);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledWith({ userId: "user-1" }, "rep-1");
    expect(result).toMatchObject({ success: true, data: { readBackVerified: true } });
  });

  it("maps legacy save requests into the same proposal transaction", async () => {
    service.createResumeEditProposalForUser.mockResolvedValue({
      id: "rep-legacy",
      sectionId: "skills",
      proposedContent: "AI 产品设计\nRAG 知识库\n数据分析",
      proposedHash: "hash-1",
      baseHash: "base-1",
      baseVersion: "v1",
      status: "pending",
      readBackVerified: true,
    });
    const result = await saveResumeSection.handler({
      section: "技能",
      content: "AI 产品设计：能够完成需求分析、方案设计与上线验证。\nRAG 知识库：具备检索、评测和持续优化经验。\n数据分析：熟练使用 SQL 与指标体系。",
    }, { ...context, requestId: "legacy-save-1", allowlist: ["save_resume_section"] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(service.createResumeEditProposalForUser).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ requestId: "legacy-save-1", sectionId: "skills" }),
    );
    expect(result).toMatchObject({ success: true, data: { proposalCreated: true, readBackVerified: true } });
  });
});
