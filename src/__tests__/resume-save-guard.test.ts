import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildResumeEditProposalActionPlan,
  buildResumeSavePlan,
  claimsResumeSaved,
  sanitizeUnsupportedResumeSaveClaim,
  validateResumeSectionContent,
} from "@/lib/agent/resume-save-guard";
import { saveResumeSection } from "@/lib/agent/tools/action/save-resume-section";
import { createResumeEditProposal } from "@/lib/agent/tools/action/create-resume-edit-proposal";
import { applyResumeEditProposal } from "@/lib/agent/tools/action/apply-resume-edit-proposal";
import { discardResumeEditProposal } from "@/lib/agent/tools/action/discard-resume-edit-proposal";
import { rollbackResumeEditProposal } from "@/lib/agent/tools/action/rollback-resume-edit-proposal";
import { applyResumeEditProposalToCvData, ResumeEditProposalApplyError, rollbackResumeEditProposalInCvData, type ResumeEditProposalRecord } from "@/lib/agent/resume-edit-proposals";
import { stableContentHash } from "@/lib/agent/verified-action";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resume save guard", () => {
  it("builds a real save plan from a pasted revised skills list", () => {
    const plan = buildResumeSavePlan([
      {
        role: "user",
        content: `技能清单你没改啊

✅ 改为：

核心能力

AI产品全链路设计（大模型选型 → Agent/RAG架构设计 → Prompt调优 → 效果评测）
Prompt Engineering & System Prompt策略调优（多轮对话、角色人设、边界治理）

技术工具

LLM应用开发框架：LangChain / 向量数据库 / RAG知识库构建
产品协作工具：Figma（原型设计）、JIRA / Notion / Confluence

模型输出说自己保存了，但是我去简历页面看了，并没有保存`,
      },
    ]);

    expect(plan?.section).toBe("skills");
    expect(plan?.reason).toBe("direct-pasted-revision");
    expect(plan?.content).toContain("AI产品全链路设计");
    expect(plan?.content).toContain("产品协作工具");
    expect(plan?.content).not.toContain("模型输出");
  });

  it("builds a save plan from the latest optimization tool result", () => {
    const plan = buildResumeSavePlan([
      {
        role: "tool",
        content: `## ✅ 技能 优化方案

### 第一版
核心能力

AI产品全链路设计
Prompt Engineering

*策略: 聚焦 AI 产品*

### 第二版
SQL / 数据分析

---
⚠️ 请选择一个方案`,
      },
      { role: "user", content: "应用第一版到技能清单" },
    ]);

    expect(plan?.section).toBe("skills");
    expect(plan?.reason).toBe("recent-optimization-result");
    expect(plan?.content).toContain("AI产品全链路设计");
    expect(plan?.content).not.toContain("策略");
  });

  it("selects a persisted draft id instead of reconstructing proposal content", () => {
    const plan = buildResumeSavePlan([
      {
        role: "tool",
        content: "技能草稿已持久化：方案一 draft_complete_1；方案二 draft_focused_2",
      },
      { role: "user", content: "选择第二版保存到技能清单" },
    ]);

    expect(plan).toEqual({
      section: "skills",
      content: "",
      reason: "recent-optimization-result",
      draftId: "draft_focused_2",
    });
  });

  it("does not hijack excellent reference resume save requests", () => {
    const plan = buildResumeSavePlan([
      { role: "assistant", content: "这是一份优秀简历。" },
      { role: "user", content: "保存成 AI 产品经理优秀简历" },
    ]);

    expect(plan).toBeNull();
  });

  it("builds proposal action plans from refreshed chat history", () => {
    expect(buildResumeEditProposalActionPlan([
      { role: "tool", content: "已创建简历修改提案 rep_refresh_1（skills），请先确认差异，确认后才会写入 CV。" },
      { role: "user", content: "确认，应用这个提案" },
    ])).toEqual({ action: "apply", proposalId: "rep_refresh_1" });

    expect(buildResumeEditProposalActionPlan([
      { role: "tool", content: "已应用简历修改提案 rep_refresh_2（skills），并完成回读校验。" },
      { role: "user", content: "回滚这个提案" },
    ])).toEqual({ action: "rollback", proposalId: "rep_refresh_2" });
  });

  it("rejects placeholder edit instructions instead of treating them as project content", async () => {
    const corrupted = "**工作经历 — 携程**（保持原有详细描述，不动）\n\n**项目经验** → 替换为：";

    expect(validateResumeSectionContent("projects", corrupted)).toMatchObject({
      valid: false,
    });

    const plan = buildResumeSavePlan([
      {
        role: "assistant",
        content: `修改后：\n${corrupted}`,
      },
      { role: "user", content: "就按这个保存到项目经验" },
    ]);
    expect(plan).toBeNull();

    const result = await saveResumeSection.handler({ section: "项目经验", content: corrupted });
    expect(result.success).toBe(false);
    expect(result.error).toContain("保存被拦截");
  });

  it("rewrites unsupported save claims when no save tool succeeded", () => {
    const text = "已成功保存到简历，打开简历页面查看。";

    expect(claimsResumeSaved(text)).toBe(true);
    expect(sanitizeUnsupportedResumeSaveClaim(text, false)).toContain("还没有真正写入简历页面");
    expect(sanitizeUnsupportedResumeSaveClaim(text, true)).toBe(text);
  });

  it("routes legacy section saves through a read-back verified proposal", async () => {
    const nextContent = "核心能力\nAI产品全链路设计\nPrompt Engineering\nRAG知识库构建";
    const proposal = {
      id: "rep-legacy-save-1",
      sectionId: "skills",
      baseVersion: "v1",
      baseHash: "fnv1a32:basehash",
      originalContent: "旧技能清单",
      proposedContent: nextContent,
      proposedHash: stableContentHash(nextContent),
      reason: "legacy_save_resume_section",
      riskFlags: ["legacy_save_resume_section", "agent_generated"],
      status: "pending",
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: proposal }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: proposal }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveResumeSection.handler({
      section: "技能",
      content: nextContent,
    });

    expect(result.success).toBe(true);
    expect(result.verifiedAction?.success).toBe(true);
    expect(result.verifiedAction?.readBack).toMatchObject({
      ok: true,
      code: "read_back.match",
    });
    expect(result.data).toMatchObject({ saved: false, proposalCreated: true, readBackVerified: true });
    expect(result.uiPayload).toMatchObject({ type: "resume_edit_proposal", status: "pending" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/cv/edit-proposals",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/cv/edit-proposals/rep-legacy-save-1", { cache: "no-store" });
  });

  it("creates a read-back verified resume edit proposal instead of writing CV directly", async () => {
    const proposedContent = "核心能力\nAI产品全链路设计\nPrompt Engineering\nRAG知识库构建";
    const proposal = {
      id: "rep-test-1",
      sectionId: "skills",
      baseVersion: "v1",
      baseHash: "fnv1a32:basehash",
      originalContent: "旧技能清单",
      proposedContent,
      proposedHash: stableContentHash(proposedContent),
      reason: "recent-optimization-result",
      riskFlags: ["agent_generated"],
      status: "pending",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: proposal }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: proposal }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createResumeEditProposal.handler({
      section: "技能",
      proposedContent,
      reason: "recent-optimization-result",
      riskFlags: ["agent_generated"],
    });

    expect(result.success).toBe(true);
    expect(result.verifiedAction?.success).toBe(true);
    expect(result.verifiedAction?.readBack).toMatchObject({ ok: true, code: "read_back.match" });
    expect(result.uiPayload).toMatchObject({ type: "resume_edit_proposal", readBackVerified: true, status: "pending" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/cv/edit-proposals",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/cv/edit-proposals/rep-test-1", { cache: "no-store" });
  });

  it("applies a pending resume edit proposal to the matching CV snapshot", () => {
    const cvData = {
      activeVersion: "v1",
      versions: {
        v1: {
          sections: [
            { id: "skills", title: "Skills", content: "Old skills list" },
          ],
        },
      },
    };
    const proposedContent = "Core skills\nAI product design\nPrompt Engineering\nRAG knowledge base";
    const proposal: ResumeEditProposalRecord = {
      id: "rep-apply-1",
      user_id: "u1",
      section_id: "skills",
      base_version: "v1",
      base_hash: stableContentHash(cvData.versions.v1),
      original_content: "Old skills list",
      proposed_content: proposedContent,
      proposed_hash: stableContentHash(proposedContent),
      reason: "user approved draft",
      risk_flags_json: "[\"agent_generated\"]",
      status: "pending",
    };

    const applied = applyResumeEditProposalToCvData(proposal, cvData);
    const active = applied.cvData.versions as Record<string, { sections: Array<{ id: string; content: string }> }>;

    expect(active.v1.sections[0].content).toBe(proposedContent);
    expect(applied.previousContent).toBe("Old skills list");
    expect(applied.appliedContent).toBe(proposedContent);
    expect(cvData.versions.v1.sections[0].content).toBe("Old skills list");
  });

  it("blocks applying a stale resume edit proposal", () => {
    const cvData = {
      activeVersion: "v1",
      versions: {
        v1: {
          sections: [
            { id: "skills", title: "Skills", content: "User changed the skills list" },
          ],
        },
      },
    };
    const proposal: ResumeEditProposalRecord = {
      id: "rep-stale-1",
      user_id: "u1",
      section_id: "skills",
      base_version: "v1",
      base_hash: "fnv1a32:stale",
      original_content: "Old skills list",
      proposed_content: "Core skills\nAI product design\nPrompt Engineering\nRAG knowledge base",
      proposed_hash: "fnv1a32:new",
      reason: "user approved draft",
      risk_flags_json: "[]",
      status: "pending",
    };

    expect(() => applyResumeEditProposalToCvData(proposal, cvData)).toThrow(ResumeEditProposalApplyError);
  });

  it("applies a proposal through the tool only when server read-back verified", async () => {
    const appliedContent = "Core skills\nAI product design\nPrompt Engineering\nRAG knowledge base";
    const data = {
      proposal: { id: "rep-apply-tool-1", status: "applied" },
      sectionId: "skills",
      baseVersion: "v1",
      baseHash: "fnv1a32:basehash",
      appliedHash: "fnv1a32:appliedhash",
      previousContent: "Old skills list",
      appliedContent,
      readBackVerified: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyResumeEditProposal.handler({ proposalId: "rep-apply-tool-1" });

    expect(result.success).toBe(true);
    expect(result.verifiedAction?.success).toBe(true);
    expect(result.verifiedAction?.readBack).toMatchObject({ ok: true, code: "read_back.match" });
    expect(result.uiPayload).toMatchObject({ type: "resume_edit_proposal_applied", readBackVerified: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/cv/edit-proposals/rep-apply-tool-1/apply", { method: "POST" });
  });

  it("rolls back an applied proposal only when current content still matches the proposal", () => {
    const proposedContent = "Core skills\nAI product design\nPrompt Engineering\nRAG knowledge base";
    const cvData = {
      activeVersion: "v1",
      versions: {
        v1: {
          sections: [
            { id: "skills", title: "Skills", content: proposedContent },
          ],
        },
      },
    };
    const proposal: ResumeEditProposalRecord = {
      id: "rep-rollback-1",
      user_id: "u1",
      section_id: "skills",
      base_version: "v1",
      base_hash: "fnv1a32:base",
      original_content: "Old skills list",
      proposed_content: proposedContent,
      proposed_hash: stableContentHash(proposedContent),
      reason: "user approved draft",
      risk_flags_json: "[]",
      status: "applied",
    };

    const rollback = rollbackResumeEditProposalInCvData(proposal, cvData);
    const active = rollback.cvData.versions as Record<string, { sections: Array<{ id: string; content: string }> }>;

    expect(active.v1.sections[0].content).toBe("Old skills list");
    expect(rollback.replacedContent).toBe(proposedContent);
    expect(rollback.restoredContent).toBe("Old skills list");
  });

  it("blocks rollback when the section changed after proposal apply", () => {
    const proposal: ResumeEditProposalRecord = {
      id: "rep-rollback-conflict-1",
      user_id: "u1",
      section_id: "skills",
      base_version: "v1",
      base_hash: "fnv1a32:base",
      original_content: "Old skills list",
      proposed_content: "Proposal-applied skills",
      proposed_hash: "fnv1a32:new",
      reason: "user approved draft",
      risk_flags_json: "[]",
      status: "applied",
    };
    const cvData = {
      activeVersion: "v1",
      versions: {
        v1: { sections: [{ id: "skills", title: "Skills", content: "User made newer manual edits" }] },
      },
    };

    expect(() => rollbackResumeEditProposalInCvData(proposal, cvData)).toThrow(ResumeEditProposalApplyError);
  });

  it("discards a pending proposal through the tool with status read-back", async () => {
    const data = {
      proposal: { id: "rep-discard-tool-1", status: "discarded" },
      readBackVerified: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await discardResumeEditProposal.handler({ proposalId: "rep-discard-tool-1" });

    expect(result.success).toBe(true);
    expect(result.verifiedAction?.success).toBe(true);
    expect(result.verifiedAction?.readBack).toMatchObject({ ok: true, code: "read_back.match" });
    expect(result.uiPayload).toMatchObject({ type: "resume_edit_proposal_discarded", readBackVerified: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/cv/edit-proposals/rep-discard-tool-1/discard", { method: "POST" });
  });

  it("rolls back a proposal through the tool only when server read-back verified", async () => {
    const restoredContent = "Old skills list";
    const data = {
      proposal: { id: "rep-rollback-tool-1", status: "rolled_back" },
      sectionId: "skills",
      baseVersion: "v1",
      rollbackHash: "fnv1a32:rollbackhash",
      restoredContent,
      replacedContent: "Core skills\nAI product design\nPrompt Engineering\nRAG knowledge base",
      readBackVerified: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rollbackResumeEditProposal.handler({ proposalId: "rep-rollback-tool-1" });

    expect(result.success).toBe(true);
    expect(result.verifiedAction?.success).toBe(true);
    expect(result.verifiedAction?.readBack).toMatchObject({ ok: true, code: "read_back.match" });
    expect(result.uiPayload).toMatchObject({ type: "resume_edit_proposal_rolled_back", readBackVerified: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/cv/edit-proposals/rep-rollback-tool-1/rollback", { method: "POST" });
  });

  it("blocks stale legacy save proposals when base version or hash changed", async () => {
    const currentCv = {
      activeVersion: "v2",
      versions: {
        v2: {
          sections: [
            { id: "skills", title: "技能", content: "当前技能清单" },
          ],
        },
      },
    };
    const nextContent = "核心能力\nAI产品全链路设计\nPrompt Engineering\nRAG知识库构建";
    const currentHash = stableContentHash(currentCv.versions.v2);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: "简历已经发生变化，已阻止用旧上下文创建修改提案。请重新读取简历后再生成方案。",
          code: "base_version_conflict",
          data: {
            expectedBaseVersion: "v1",
            currentBaseVersion: "v2",
            expectedBaseHash: "fnv1a32:00000000",
            currentBaseHash: currentHash,
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveResumeSection.handler({
      section: "技能",
      content: nextContent,
      baseVersion: "v1",
      baseHash: "fnv1a32:00000000",
    });

    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe("need_user_input");
    expect(result.error).toContain("简历已经发生变化");
    expect(result.verifiedAction?.success).toBe(false);
    expect(result.verifiedAction?.verifier.code).toBe("base_version_conflict");
    expect(result.verifiedAction?.evidence).toMatchObject({
      targetField: "skills",
      versionId: "v2",
      baseHash: currentHash,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cv/edit-proposals",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
