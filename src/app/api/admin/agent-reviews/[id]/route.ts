import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/auth-guards";
import { isAgentRunLedgerAvailable } from "@/lib/agent/run-ledger";
import {
  getAgentRunReviewDetail,
  redactReviewText,
  sanitizeReviewJson,
} from "@/lib/agent/run-review";
import type { AgentRunStepRecord } from "@/lib/agent/run-ledger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    if (!isAgentRunLedgerAvailable()) {
      return NextResponse.json({ success: true, enabled: false, data: null });
    }
    const { id } = await params;
    const detail = await getAgentRunReviewDetail(Number(id));
    if (!detail) {
      return NextResponse.json({ success: false, error: "Review not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      enabled: true,
      data: {
        review: detail.review,
        run: detail.run ? {
          id: detail.run.id,
          userId: detail.run.user_id,
          sessionId: detail.run.session_id,
          taskType: detail.run.task_type,
          agentId: detail.run.agent_id,
          status: detail.run.status,
          contract: sanitizeReviewJson(detail.run.contract_json),
          result: sanitizeReviewJson(detail.run.result_json),
          error: sanitizeReviewJson(detail.run.error_json),
          createdAt: detail.run.created_at,
          updatedAt: detail.run.updated_at,
        } : null,
        steps: detail.steps.map(toStepSummary),
        candidate: detail.candidate,
      },
    });
  } catch (error) {
    return handleAdminReviewError(error, "[admin/agent-reviews/:id] GET");
  }
}

function toStepSummary(step: AgentRunStepRecord) {
  return {
    id: step.id,
    phase: step.phase,
    toolName: step.tool_name,
    status: step.status,
    inputSummary: redactReviewText(step.input_summary),
    outputSummary: redactReviewText(step.output_summary),
    verifier: sanitizeReviewJson(step.verifier_json),
    error: sanitizeReviewJson(step.error_json),
    createdAt: step.created_at,
  };
}

function handleAdminReviewError(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Forbidden") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  if (["Not authenticated", "Invalid or expired token", "Token has been revoked"].includes(message)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  console.error(label, error);
  return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
}
