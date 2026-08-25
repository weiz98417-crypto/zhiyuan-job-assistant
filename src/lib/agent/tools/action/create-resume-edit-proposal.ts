import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import {
  buildVerifiedActionFailure,
  buildVerifiedActionSuccess,
  stableContentHash,
  validateDocumentFieldContent,
} from "@/lib/agent/verified-action";
import { createResumeEditProposalForUser } from "@/lib/server/resume-edit-proposal-service";

const SECTION_MAP: Record<string, ResumeSectionId> = {
  "个人概述": "summary", "概述": "summary", summary: "summary",
  "工作经历": "experience", "经历": "experience", experience: "experience",
  "项目经验": "projects", "项目": "projects", projects: "projects",
  "教育背景": "education", "教育": "education", education: "education",
  "技能": "skills", skills: "skills",
};

function resolveSection(value: unknown): ResumeSectionId {
  const text = String(value || "experience");
  return SECTION_MAP[text] || "experience";
}

function riskFlagsFromParams(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const draftId = String(params.draftId || "");
  const sectionId = resolveSection(params.section || params.sectionId);
  const proposedContent = String(params.proposedContent || params.content || "");
  const reason = String(params.reason || "").slice(0, 1200);
  const riskFlags = riskFlagsFromParams(params.riskFlags);

  if (context) {
    try {
      const proposal = await createResumeEditProposalForUser(context.principal, {
        sectionId,
        proposedContent,
        reason,
        riskFlags,
        draftId: draftId || undefined,
        expectedBaseHash: String(params.baseHash || params.expectedBaseHash || ""),
        expectedBaseVersion: String(params.baseVersion || params.expectedBaseVersion || ""),
        requestId: context.requestId,
      });
      const contentValidation = validateDocumentFieldContent(proposal.proposedContent, {
        minCompactLength: 1,
        targetLabel: proposal.sectionId,
      });
      const verifiedAction = buildVerifiedActionSuccess({
        action: "create_resume_edit_proposal",
        targetType: "cv",
        targetId: proposal.id,
        targetField: proposal.sectionId,
        baseHash: proposal.baseHash,
        versionId: proposal.baseVersion,
        data: proposal,
        expectedContent: proposal.proposedContent,
        readBackContent: proposal.proposedContent,
        checks: contentValidation.checks,
      });
      return {
        success: true,
        data: proposal,
        errorCategory: "ok",
        llmSummary: `已创建简历修改提案 ${proposal.id}，板块 ${proposal.sectionId}，等待用户审批后才会写入 CV。`,
        uiPayload: { type: "resume_edit_proposal", ...proposal },
        rawData: proposal,
        verifiedAction,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建简历修改提案失败";
      return {
        success: false,
        data: null,
        error: message,
        errorCategory: /变化|不存在|无效|为空|找不到/.test(message) ? "need_user_input" : "transient",
        recoverable: !/变化|不存在|无效|为空|找不到/.test(message),
        verifiedAction: buildVerifiedActionFailure({
          action: "create_resume_edit_proposal",
          targetType: "cv",
          targetField: sectionId,
          error: message,
        }),
      };
    }
  }

  const validation = draftId ? { valid: true } : validateResumeSectionContent(sectionId, proposedContent);
  if (!validation.valid) {
    const error = validation.reason || "提案内容未通过校验";
    return {
      success: false,
      data: null,
      error,
      errorCategory: "need_user_input",
      verifiedAction: buildVerifiedActionFailure({
        action: "create_resume_edit_proposal",
        targetType: "cv",
        targetField: sectionId,
        error,
      }),
    };
  }

  const res = await fetch("/api/cv/edit-proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId: draftId || undefined, sectionId, proposedContent, reason, riskFlags }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.id) {
    const error = json.error || `创建简历修改提案失败: HTTP ${res.status}`;
    return {
      success: false,
      data: null,
      error,
      errorCategory: res.status >= 500 ? "transient" : "need_user_input",
      verifiedAction: buildVerifiedActionFailure({
        action: "create_resume_edit_proposal",
        targetType: "cv",
        targetField: sectionId,
        error,
      }),
    };
  }

  const proposal = json.data as Record<string, unknown>;
  const effectiveSectionId = resolveSection(proposal.sectionId || sectionId);
  const effectiveProposedContent = String(proposal.proposedContent || proposedContent);
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

  const documentValidation = validateDocumentFieldContent(effectiveProposedContent, {
    minCompactLength: 1,
    targetLabel: effectiveSectionId,
  });
  const readBackContent = typeof readBack?.proposedContent === "string" ? readBack.proposedContent : "";
  const verifiedAction = readBack
    ? buildVerifiedActionSuccess({
        action: "create_resume_edit_proposal",
        targetType: "cv",
        targetId: String(proposal.id),
        targetField: effectiveSectionId,
        baseHash: String(proposal.baseHash || ""),
        versionId: String(proposal.baseVersion || ""),
        data: proposal,
        expectedContent: effectiveProposedContent,
        readBackContent,
        checks: [
          ...documentValidation.checks,
          {
            phase: "readBack" as const,
            ok: readBack.id === proposal.id,
            code: readBack.id === proposal.id ? "proposal.id_match" : "proposal.id_mismatch",
            message: "Proposal id read-back matches created id.",
          },
        ],
      })
    : buildVerifiedActionFailure({
        action: "create_resume_edit_proposal",
        targetType: "cv",
        targetId: String(proposal.id || ""),
        targetField: effectiveSectionId,
        baseHash: String(proposal.baseHash || ""),
        versionId: String(proposal.baseVersion || ""),
        error: readBackError || "proposal read-back failed",
      });

  if (!verifiedAction.success) {
    return {
      success: false,
      data: proposal,
      error: `简历修改提案创建后读回校验失败：${verifiedAction.error || readBackError}`,
      errorCategory: "permanent",
      verifiedAction,
      uiPayload: { ...proposal, readBackVerified: false, readBackError: verifiedAction.error || readBackError },
    };
  }

  const data = { ...proposal, readBackVerified: true, proposedHash: proposal.proposedHash || stableContentHash(effectiveProposedContent) };
  return {
    success: true,
    data,
    errorCategory: "ok",
    llmSummary: `已创建简历修改提案 ${proposal.id}，板块 ${effectiveSectionId}，等待用户审批后才会写入 CV。`,
    uiPayload: { type: "resume_edit_proposal", ...data },
    rawData: data,
    verifiedAction,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `创建简历修改提案失败: ${result.error}`;
  const d = result.data as { id?: string; sectionId?: string };
  return `已创建简历修改提案 ${d.id || ""}（${d.sectionId || "unknown"}），等待用户确认后再应用。`;
}

export const createResumeEditProposal: ToolDefinition = {
  name: "create_resume_edit_proposal",
  description: "创建简历修改提案，只保存为待审批草稿，不直接写入 CV。用于用户确认前的安全简历改写流程。",
  parameters: {
    section: { type: "string", required: false, description: "板块名称：工作经历/项目经验/技能/个人概述/教育背景。使用 draftId 时可省略" },
    proposedContent: { type: "string", required: false, description: "提案中的完整板块新内容。使用 draftId 时由服务端从持久化草稿读取" },
    reason: { type: "string", required: false, description: "为什么建议这样修改，简短说明" },
    riskFlags: { type: "array", required: false, description: "风险标记，如 content_rewrite、large_change、jd_tailored" },
    draftId: { type: "string", required: false, description: "已持久化的简历草稿 ID。用户从草稿卡选择方案时优先传此 ID，不要从聊天正文重建内容" },
  },
  category: "action",
  handler,
  formatResult,
};
