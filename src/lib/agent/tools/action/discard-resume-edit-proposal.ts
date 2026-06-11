import type { ToolDefinition, ToolResult } from "../types";
import { buildVerifiedActionFailure, buildVerifiedActionSuccess } from "@/lib/agent/verified-action";

function getProposalId(params: Record<string, unknown>): string {
  return String(params.proposalId || params.id || "").trim();
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
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
  formatResult,
};
