import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolReconciliationOutcome,
  ToolResult,
} from "../types";
import { buildVerifiedActionFailure, buildVerifiedActionSuccess } from "@/lib/agent/verified-action";
import {
  discardResumeEditProposalForUser,
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
    const outcome = await reconcileResumeEditProposalForUser(context.principal, proposalId, "discarded");
    const data = outcome.data;
    if (outcome.state !== "verified" || !data) return outcome;
    return {
      state: "verified",
      summary: `简历修改提案 ${proposalId} 已废弃且读回一致`,
      result: {
        success: true,
        data,
        errorCategory: "ok",
        llmSummary: `简历修改提案 ${proposalId} 已废弃且读回一致。`,
        rawData: data,
      },
    };
  } catch {
    return { state: "unknown", summary: `简历修改提案 ${proposalId} 的废弃状态仍无法确认` };
  }
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const proposalId = getProposalId(params);
  if (!proposalId) {
    const error = "缺少简历修改提案 id，无法废弃。";
    return {
      success: false,
      data: null,
      error,
      errorCategory: "need_user_input",
      verifiedAction: buildVerifiedActionFailure({
        action: "discard_resume_edit_proposal",
        targetType: "cv",
        error,
      }),
    };
  }

  if (context) {
    try {
      const data = await discardResumeEditProposalForUser(context.principal, proposalId);
      const verifiedAction = buildVerifiedActionSuccess({
        action: "discard_resume_edit_proposal",
        targetType: "cv",
        targetId: proposalId,
        data,
        expectedContent: "discarded",
        readBackContent: data.proposal.status,
        checks: [{ phase: "readBack", ok: true, code: "proposal.status_discarded", message: "Proposal status read-back is discarded." }],
      });
      return {
        success: true,
        data,
        errorCategory: "ok",
        llmSummary: `已废弃简历修改提案 ${proposalId}，不会改动 CV。`,
        uiPayload: { type: "resume_edit_proposal_discarded", ...data },
        rawData: data,
        verifiedAction,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "废弃简历修改提案失败";
      return {
        success: false,
        data: null,
        error: message,
        errorCategory: /not found|not pending|不存在/.test(message) ? "need_user_input" : "transient",
        recoverable: !/not found|not pending|不存在/.test(message),
        verifiedAction: buildVerifiedActionFailure({
          action: "discard_resume_edit_proposal",
          targetType: "cv",
          targetId: proposalId,
          error: message,
        }),
      };
    }
  }

  const res = await fetch(`/api/cv/edit-proposals/${proposalId}/discard`, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.readBackVerified) {
    const error = json.error || `废弃简历修改提案失败: HTTP ${res.status}`;
    return {
      success: false,
      data: json.data || null,
      error,
      errorCategory: res.status === 409 ? "need_user_input" : res.status >= 500 ? "transient" : "permanent",
      verifiedAction: buildVerifiedActionFailure({
        action: "discard_resume_edit_proposal",
        targetType: "cv",
        targetId: proposalId,
        error,
      }),
      uiPayload: { ...(json.data || {}), readBackVerified: false, readBackError: error },
    };
  }

  const data = json.data as Record<string, unknown>;
  const verifiedAction = buildVerifiedActionSuccess({
    action: "discard_resume_edit_proposal",
    targetType: "cv",
    targetId: proposalId,
    data,
    expectedContent: "discarded",
    readBackContent: "discarded",
    checks: [{ phase: "readBack", ok: true, code: "proposal.status_discarded", message: "Proposal status read-back is discarded." }],
  });

  return {
    success: true,
    data: { ...data, readBackVerified: true },
    errorCategory: "ok",
    llmSummary: `已废弃简历修改提案 ${proposalId}，不会改动 CV。`,
    uiPayload: { type: "resume_edit_proposal_discarded", ...data, readBackVerified: true },
    rawData: { ...data, readBackVerified: true },
    verifiedAction,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `废弃简历修改提案失败: ${result.error}`;
  const d = result.data as { proposal?: { id?: string } };
  return `已废弃简历修改提案 ${d.proposal?.id || ""}，CV 未改动。`;
}

export const discardResumeEditProposal: ToolDefinition = {
  name: "discard_resume_edit_proposal",
  description: "在用户拒绝某个简历修改提案时，将 pending 提案标记为废弃，并通过回读确认 CV 不会被改动。",
  parameters: {
    proposalId: { type: "string", required: true, description: "要废弃的简历修改提案 id，例如 rep_xxx" },
  },
  category: "action",
  handler,
  reconcile,
  formatResult,
};
