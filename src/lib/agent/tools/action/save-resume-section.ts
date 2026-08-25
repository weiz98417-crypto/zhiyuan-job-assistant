import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import {
  createResumeEditProposalForUser,
  ResumeProposalServiceError,
} from "@/lib/server/resume-edit-proposal-service";
import {
  buildVerifiedActionFailure,
  buildVerifiedActionSuccess,
  stableContentHash,
  validateDocumentFieldContent,
} from "@/lib/agent/verified-action";

const SECTION_MAP: Record<string, ResumeSectionId> = {
  "个人概述": "summary", "概述": "summary", summary: "summary",
  "工作经历": "experience", "经历": "experience", experience: "experience",
  "项目经验": "projects", "项目": "projects", projects: "projects",
  "教育背景": "education", "教育": "education", education: "education",
  "技能": "skills", "技能清单": "skills", skills: "skills",
};

function resolveSection(value: unknown): ResumeSectionId {
  const text = String(value || "experience").trim();
  return SECTION_MAP[text] || "experience";
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const sectionId = resolveSection(params.section || params.sectionId);
  const proposedContent = String(params.content || params.proposedContent || "");
  const expectedBaseHash = typeof params.baseHash === "string" ? params.baseHash : "";
  const expectedBaseVersion = typeof params.baseVersion === "string" ? params.baseVersion : "";

  if (!proposedContent.trim()) {
    const error = "新内容不能为空";
    return {
      success: false,
      data: null,
      error,
      recoverable: false,
      retryHint: "请提供要保存的完整板块内容",
      verifiedAction: buildVerifiedActionFailure({
        action: "save_resume_section",
        targetType: "cv",
        targetField: sectionId,
        error,
      }),
    };
  }

  const validation = validateResumeSectionContent(sectionId, proposedContent);
  if (!validation.valid) {
    const error = `保存被拦截: ${validation.reason || "内容不像完整简历板块"}`;
    return {
      success: false,
      data: null,
      error,
      recoverable: false,
      retryHint: "请提供要写入该板块的完整正文，不要只提供修改说明、占位符或对照表。",
      verifiedAction: buildVerifiedActionFailure({
        action: "save_resume_section",
        targetType: "cv",
        targetField: sectionId,
        error,
      }),
    };
  }

  if (context) {
    try {
      const proposal = await createResumeEditProposalForUser(context.principal, {
        sectionId,
        proposedContent,
        reason: "legacy_save_resume_section",
        riskFlags: ["legacy_save_resume_section", "agent_generated"],
        expectedBaseHash,
        expectedBaseVersion,
        requestId: context.requestId || `${context.runId}:save_resume_section`,
      });
      const verifiedAction = buildVerifiedActionSuccess({
        action: "save_resume_section",
        targetType: "cv",
        targetId: proposal.id,
        targetField: sectionId,
        baseHash: proposal.baseHash,
        versionId: proposal.baseVersion,
        data: proposal,
        expectedContent: proposedContent,
        readBackContent: proposal.proposedContent,
      });
      const data = {
        ...proposal,
        saved: false,
        proposalCreated: true,
        proposedHash: proposal.proposedHash || stableContentHash(proposedContent),
      };
      return {
        success: true,
        data,
        errorCategory: "ok",
        llmSummary: `已创建简历修改提案 ${proposal.id}，等待用户确认后才会写入 CV。`,
        uiPayload: { type: "resume_edit_proposal", ...data },
        rawData: data,
        verifiedAction,
      };
    } catch (error) {
      const code = error instanceof ResumeProposalServiceError ? error.code : "verification_failed";
      const message = error instanceof Error ? error.message : "创建简历修改提案失败";
      return {
        success: false,
        data: null,
        error: message,
        errorCategory: code === "conflict" || code === "invalid_input" || code === "not_found" ? "need_user_input" : "transient",
        recoverable: code === "verification_failed",
        verifiedAction: buildVerifiedActionFailure({
          action: "save_resume_section",
          targetType: "cv",
          targetField: sectionId,
          error: message,
        }),
      };
    }
  }

  const res = await fetch("/api/cv/edit-proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sectionId,
      proposedContent,
      reason: "legacy_save_resume_section",
      riskFlags: ["legacy_save_resume_section", "agent_generated"],
      baseHash: expectedBaseHash,
      baseVersion: expectedBaseVersion,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.id) {
    const error = json.error || `创建简历修改提案失败: HTTP ${res.status}`;
    const conflictData = json.data && typeof json.data === "object" ? json.data as Record<string, unknown> : {};
    const isBaseConflict = json.code === "base_version_conflict";
    return {
      success: false,
      data: json.data || null,
      error,
      errorCategory: res.status === 409 ? "need_user_input" : res.status >= 500 ? "transient" : "permanent",
      recoverable: res.status >= 500,
      retryHint: res.status === 409 ? "请重新读取最新简历后再生成修改方案。" : "请检查简历数据后重试。",
      verifiedAction: buildVerifiedActionFailure({
        action: "save_resume_section",
        targetType: "cv",
        targetField: sectionId,
        targetId: json.data?.id ? String(json.data.id) : undefined,
        baseHash: isBaseConflict ? String(conflictData.currentBaseHash || "") : undefined,
        versionId: isBaseConflict ? String(conflictData.currentBaseVersion || "") : undefined,
        verifier: isBaseConflict ? {
          phase: "verifier",
          ok: false,
          code: "base_version_conflict",
          message: error,
        } : undefined,
        error,
      }),
      uiPayload: { ...(json.data || {}), readBackVerified: false, readBackError: error },
    };
  }

  const proposal = json.data as Record<string, unknown>;
  let readBack: Record<string, unknown> | null = null;
  let readBackError = "";
  try {
    const verifyRes = await fetch(`/api/cv/edit-proposals/${proposal.id}`, { cache: "no-store" });
    const verifyJson = await verifyRes.json().catch(() => ({}));
    if (verifyRes.ok && verifyJson.success && verifyJson.data?.id === proposal.id) {
      readBack = verifyJson.data as Record<string, unknown>;
    } else {
      readBackError = verifyJson.error || "proposal read-back failed";
    }
  } catch (error) {
    readBackError = error instanceof Error ? error.message : "proposal read-back failed";
  }

  const readBackContent = typeof readBack?.proposedContent === "string" ? readBack.proposedContent : "";
  const documentValidation = validateDocumentFieldContent(proposedContent, {
    minCompactLength: 1,
    targetLabel: sectionId,
  });
  const verifiedAction = readBack
    ? buildVerifiedActionSuccess({
        action: "save_resume_section",
        targetType: "cv",
        targetId: String(proposal.id),
        targetField: sectionId,
        baseHash: String(proposal.baseHash || ""),
        versionId: String(proposal.baseVersion || ""),
        data: proposal,
        expectedContent: proposedContent,
        readBackContent,
        checks: documentValidation.checks,
      })
    : buildVerifiedActionFailure({
        action: "save_resume_section",
        targetType: "cv",
        targetId: String(proposal.id || ""),
        targetField: sectionId,
        baseHash: String(proposal.baseHash || ""),
        versionId: String(proposal.baseVersion || ""),
        error: readBackError || "proposal read-back failed",
      });

  if (!verifiedAction.success) {
    return {
      success: false,
      data: proposal,
      error: `简历修改提案创建后回读校验失败: ${verifiedAction.error || readBackError}`,
      errorCategory: "permanent",
      verifiedAction,
      uiPayload: { ...proposal, readBackVerified: false, readBackError: verifiedAction.error || readBackError },
    };
  }

  const data = {
    ...proposal,
    saved: false,
    proposalCreated: true,
    readBackVerified: true,
    proposedHash: proposal.proposedHash || stableContentHash(proposedContent),
  };
  return {
    success: true,
    data,
    errorCategory: "ok",
    llmSummary: `已创建简历修改提案 ${proposal.id}，等待用户确认后才会写入 CV。`,
    uiPayload: { type: "resume_edit_proposal", ...data },
    rawData: data,
    verifiedAction,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `保存请求已拦截: ${result.error}`;
  const d = result.data as { id?: string; sectionId?: string };
  return `已创建简历修改提案 ${d.id || ""}（${d.sectionId || "unknown"}），请先确认差异，确认后才会写入 CV。`;
}

export const saveResumeSection: ToolDefinition = {
  name: "save_resume_section",
  description: "兼容旧流程的安全保存入口：不会直接覆盖 CV，只会创建待审批简历修改提案；用户确认后必须通过 apply_resume_edit_proposal 写入。",
  parameters: {
    section: { type: "string", required: true, description: "板块名称：工作经历/项目经验/技能/个人概述/教育背景" },
    content: { type: "string", required: true, description: "要保存的完整板块内容，会先进入待审批提案" },
    baseHash: { type: "string", required: false, description: "Agent run 开始时读取到的 CV 基线哈希，用于防止并发覆盖。" },
    baseVersion: { type: "string", required: false, description: "Agent run 开始时读取到的 CV 版本 id，用于防止并发覆盖。" },
  },
  category: "action",
  handler,
  formatResult,
};
