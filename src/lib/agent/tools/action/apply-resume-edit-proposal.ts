import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolReconciliationOutcome,
  ToolResult,
} from "../types";
import {
  buildVerifiedActionFailure,
  buildVerifiedActionSuccess,
  validateDocumentFieldContent,
} from "@/lib/agent/verified-action";
import {
  applyResumeEditProposalForUser,
  reconcileResumeEditProposalForUser,
} from "@/lib/server/resume-edit-proposal-service";

function getProposalId(params: Record<string, unknown>): string {
  return String(params.proposalId || params.id || "").trim();
}

async function reconcile(
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolReconciliationOutcome> {
  const proposalId = getProposalId(params);
  if (!proposalId) return { state: "not_executed", summary: "缺少 proposalId，工具不可能完成写入" };
  try {
    const outcome = await reconcileResumeEditProposalForUser(context.principal, proposalId, "applied");
    const data = outcome.data;
    if (outcome.state !== "verified" || !data) return outcome;
    return {
      state: "verified",
      summary: `简历修改提案 ${proposalId} 已应用且读回一致`,
      result: {
        success: true,
        data,
        errorCategory: "ok",
        llmSummary: `简历修改提案 ${proposalId} 已应用且读回一致。`,
        rawData: data,
      },
    };
  } catch {
    return { state: "unknown", summary: `简历修改提案 ${proposalId} 的最终状态仍无法确认` };
  }
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const proposalId = getProposalId(params);
  if (!proposalId) {
    const error = "缺少简历修改提案 id，无法应用。";
    return {
      success: false,
      data: null,
      error,
      errorCategory: "need_user_input",
      verifiedAction: buildVerifiedActionFailure({
        action: "apply_resume_edit_proposal",
        targetType: "cv",
        error,
      }),
    };
  }

  if (context) {
    try {
      const data = await applyResumeEditProposalForUser(context.principal, proposalId);
      const documentValidation = validateDocumentFieldContent(data.appliedContent, {
        minCompactLength: 1,
        targetLabel: data.sectionId,
      });
      const verifiedAction = buildVerifiedActionSuccess({
        action: "apply_resume_edit_proposal",
        targetType: "cv",
        targetId: proposalId,
        targetField: data.sectionId,
        baseHash: data.baseHash,
        versionId: data.baseVersion,
        data,
        expectedContent: data.appliedContent,
        readBackContent: data.appliedContent,
        checks: documentValidation.checks,
      });
      return {
        success: true,
        data,
        errorCategory: "ok",
        llmSummary: `已应用简历修改提案 ${proposalId}，并完成 CV 回读校验。`,
        uiPayload: { type: "resume_edit_proposal_applied", ...data },
        rawData: data,
        verifiedAction,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "应用简历修改提案失败";
      return {
        success: false,
        data: null,
        error: message,
        errorCategory: /not found|not pending|changed|conflict|不存在|变化/.test(message) ? "need_user_input" : "transient",
        recoverable: !/not found|not pending|changed|conflict|不存在|变化/.test(message),
        verifiedAction: buildVerifiedActionFailure({
          action: "apply_resume_edit_proposal",
          targetType: "cv",
          targetId: proposalId,
          error: message,
        }),
      };
    }
  }

  const res = await fetch(`/api/cv/edit-proposals/${proposalId}/apply`, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.readBackVerified) {
    const error = json.error || `应用简历修改提案失败: HTTP ${res.status}`;
    return {
      success: false,
      data: json.data || null,
      error,
      errorCategory: res.status === 409 ? "need_user_input" : res.status >= 500 ? "transient" : "permanent",
      verifiedAction: buildVerifiedActionFailure({
        action: "apply_resume_edit_proposal",
        targetType: "cv",
        targetId: proposalId,
        error,
      }),
      uiPayload: { ...(json.data || {}), readBackVerified: false, readBackError: error },
    };
  }

  const data = json.data as Record<string, unknown>;
  const sectionId = String(data.sectionId || "");
  const appliedContent = String(data.appliedContent || "");
  const documentValidation = validateDocumentFieldContent(appliedContent, {
    minCompactLength: 1,
    targetLabel: sectionId,
  });
  const verifiedAction = buildVerifiedActionSuccess({
    action: "apply_resume_edit_proposal",
    targetType: "cv",
    targetId: proposalId,
    targetField: sectionId,
    baseHash: String(data.baseHash || ""),
    versionId: String(data.baseVersion || ""),
    data,
    expectedContent: appliedContent,
    readBackContent: appliedContent,
    checks: documentValidation.checks,
  });

  if (!verifiedAction.success) {
    return {
      success: false,
      data,
      error: verifiedAction.error || "应用后内容校验失败，已阻止成功提示。",
      errorCategory: "permanent",
      verifiedAction,
      uiPayload: { ...data, readBackVerified: false, readBackError: verifiedAction.error },
    };
  }

  return {
    success: true,
    data: { ...data, readBackVerified: true },
    errorCategory: "ok",
    llmSummary: `已应用简历修改提案 ${proposalId}，并完成 CV 回读校验。`,
    uiPayload: { type: "resume_edit_proposal_applied", ...data, readBackVerified: true },
    rawData: { ...data, readBackVerified: true },
    verifiedAction,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `应用简历修改提案失败: ${result.error}`;
  const d = result.data as { proposal?: { id?: string }; sectionId?: string };
  return `已应用简历修改提案 ${d.proposal?.id || ""}（${d.sectionId || "unknown"}），并完成回读校验。`;
}

export const applyResumeEditProposal: ToolDefinition = {
  name: "apply_resume_edit_proposal",
  description: "在用户明确批准某个简历修改提案后，将该提案事务性写入 CV，并做回读校验。不要用它创建新内容，只能应用已有 proposalId。",
  parameters: {
    proposalId: { type: "string", required: true, description: "要应用的简历修改提案 id，例如 rep_xxx" },
  },
  category: "action",
  handler,
  reconcile,
  formatResult,
};
