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
  reconcileResumeEditProposalForUser,
  rollbackResumeEditProposalForUser,
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
    const outcome = await reconcileResumeEditProposalForUser(context.principal, proposalId, "rolled_back");
    const data = outcome.data;
    if (outcome.state !== "verified" || !data) return outcome;
    return {
      state: "verified",
      summary: `简历修改提案 ${proposalId} 已回滚且读回一致`,
      result: {
        success: true,
        data,
        errorCategory: "ok",
        llmSummary: `简历修改提案 ${proposalId} 已回滚且读回一致。`,
        rawData: data,
      },
    };
  } catch {
    return { state: "unknown", summary: `简历修改提案 ${proposalId} 的回滚状态仍无法确认` };
  }
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const proposalId = getProposalId(params);
  if (!proposalId) {
    const error = "缺少简历修改提案 id，无法回滚。";
    return {
      success: false,
      data: null,
      error,
      errorCategory: "need_user_input",
      verifiedAction: buildVerifiedActionFailure({
        action: "rollback_resume_edit_proposal",
        targetType: "cv",
        error,
      }),
    };
  }

  if (context) {
    try {
      const data = await rollbackResumeEditProposalForUser(context.principal, proposalId);
      const documentValidation = validateDocumentFieldContent(data.restoredContent, {
        minCompactLength: 1,
        targetLabel: data.sectionId,
      });
      const verifiedAction = buildVerifiedActionSuccess({
        action: "rollback_resume_edit_proposal",
        targetType: "cv",
        targetId: proposalId,
        targetField: data.sectionId,
        versionId: data.baseVersion,
        data,
        expectedContent: data.restoredContent,
        readBackContent: data.restoredContent,
        checks: documentValidation.checks,
      });
      return {
        success: true,
        data,
        errorCategory: "ok",
        llmSummary: `已回滚简历修改提案 ${proposalId}，并完成 CV 回读校验。`,
        uiPayload: { type: "resume_edit_proposal_rolled_back", ...data },
        rawData: data,
        verifiedAction,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "回滚简历修改提案失败";
      return {
        success: false,
        data: null,
        error: message,
        errorCategory: /not found|not applied|changed|conflict|不存在|变化/.test(message) ? "need_user_input" : "transient",
        recoverable: !/not found|not applied|changed|conflict|不存在|变化/.test(message),
        verifiedAction: buildVerifiedActionFailure({
          action: "rollback_resume_edit_proposal",
          targetType: "cv",
          targetId: proposalId,
          error: message,
        }),
      };
    }
  }

  const res = await fetch(`/api/cv/edit-proposals/${proposalId}/rollback`, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.readBackVerified) {
    const error = json.error || `回滚简历修改提案失败: HTTP ${res.status}`;
    return {
      success: false,
      data: json.data || null,
      error,
      errorCategory: res.status === 409 ? "need_user_input" : res.status >= 500 ? "transient" : "permanent",
      verifiedAction: buildVerifiedActionFailure({
        action: "rollback_resume_edit_proposal",
        targetType: "cv",
        targetId: proposalId,
        error,
      }),
      uiPayload: { ...(json.data || {}), readBackVerified: false, readBackError: error },
    };
  }

  const data = json.data as Record<string, unknown>;
  const sectionId = String(data.sectionId || "");
  const restoredContent = String(data.restoredContent || "");
  const documentValidation = validateDocumentFieldContent(restoredContent, {
    minCompactLength: 1,
    targetLabel: sectionId,
  });
  const verifiedAction = buildVerifiedActionSuccess({
    action: "rollback_resume_edit_proposal",
    targetType: "cv",
    targetId: proposalId,
    targetField: sectionId,
    versionId: String(data.baseVersion || ""),
    data,
    expectedContent: restoredContent,
    readBackContent: restoredContent,
    checks: documentValidation.checks,
  });

  if (!verifiedAction.success) {
    return {
      success: false,
      data,
      error: verifiedAction.error || "回滚后内容校验失败，已阻止成功提示。",
      errorCategory: "permanent",
      verifiedAction,
      uiPayload: { ...data, readBackVerified: false, readBackError: verifiedAction.error },
    };
  }

  return {
    success: true,
    data: { ...data, readBackVerified: true },
    errorCategory: "ok",
    llmSummary: `已回滚简历修改提案 ${proposalId}，并完成 CV 回读校验。`,
    uiPayload: { type: "resume_edit_proposal_rolled_back", ...data, readBackVerified: true },
    rawData: { ...data, readBackVerified: true },
    verifiedAction,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `回滚简历修改提案失败: ${result.error}`;
  const d = result.data as { proposal?: { id?: string }; sectionId?: string };
  return `已回滚简历修改提案 ${d.proposal?.id || ""}（${d.sectionId || "unknown"}），并完成回读校验。`;
}

export const rollbackResumeEditProposal: ToolDefinition = {
  name: "rollback_resume_edit_proposal",
  description: "在用户要求撤销已应用的简历修改时，将该 proposal 的原始内容事务性恢复到 CV，并做回读校验。仅能回滚 applied 提案。",
  parameters: {
    proposalId: { type: "string", required: true, description: "要回滚的已应用简历修改提案 id，例如 rep_xxx" },
  },
  category: "action",
  handler,
  reconcile,
  formatResult,
};
