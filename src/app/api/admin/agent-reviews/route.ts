import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { isAgentRunLedgerAvailable } from "@/lib/agent/run-ledger";
import {
  AGENT_RUN_FAILURE_TYPES,
  generateAgentRunOpenSpecDraftSuggestions,
  listAgentEvalCandidates,
  listAgentRunReviews,
  normalizeFailureType,
  type AgentRunFailureType,
  type AgentRunReviewVerdict,
  type AgentEvalCandidateStatus,
} from "@/lib/agent/run-review";

async function ensureAdmin() {
  const payload = await getCurrentUser();
  if (payload.role !== "admin") throw new Error("Forbidden");
  await verifyTokenVersion(payload);
  return payload;
}

export async function GET(request: NextRequest) {
  try {
    await ensureAdmin();
    if (!isAgentRunLedgerAvailable()) {
      return NextResponse.json({ success: true, enabled: false, data: [], candidates: [] });
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    const verdict = cleanVerdict(url.searchParams.get("verdict"));
    const failureType = cleanFailureType(url.searchParams.get("failureType"));
    const taskType = cleanFilter(url.searchParams.get("taskType"));
    const candidateStatus = cleanCandidateStatus(url.searchParams.get("candidateStatus")) || "candidate";

    const [reviews, candidates] = await Promise.all([
      listAgentRunReviews({
        limit: Number.isFinite(limit) ? limit : 50,
        verdict,
        failureType,
        taskType,
      }),
      listAgentEvalCandidates({
        status: candidateStatus,
        limit: 50,
      }),
    ]);

    return NextResponse.json({
      success: true,
      enabled: true,
      summary: buildReviewListSummary(reviews, candidates.length),
      draftSuggestion: generateAgentRunOpenSpecDraftSuggestions(reviews),
      data: reviews,
      candidates,
    });
  } catch (error) {
    return handleAdminReviewError(error, "[admin/agent-reviews] GET");
  }
}

function cleanFilter(value: string | null): string | undefined {
  const trimmed = (value || "").trim();
  return trimmed && trimmed !== "all" ? trimmed : undefined;
}

function cleanVerdict(value: string | null): AgentRunReviewVerdict | "all" | undefined {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed === "all") return undefined;
  return trimmed === "pass" || trimmed === "warning" || trimmed === "fail" ? trimmed : undefined;
}

function cleanFailureType(value: string | null): AgentRunFailureType | "all" | undefined {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed === "all") return undefined;
  return AGENT_RUN_FAILURE_TYPES.includes(trimmed as AgentRunFailureType)
    ? normalizeFailureType(trimmed)
    : undefined;
}

function cleanCandidateStatus(value: string | null): AgentEvalCandidateStatus | "all" | undefined {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed === "all") return undefined;
  return trimmed === "candidate" || trimmed === "accepted" || trimmed === "rejected" || trimmed === "promoted"
    ? trimmed
    : undefined;
}

function buildReviewListSummary(
  reviews: Awaited<ReturnType<typeof listAgentRunReviews>>,
  pendingCandidates: number,
) {
  const byVerdict: Record<string, number> = {};
  const byFailureType: Record<string, number> = {};
  const byTaskType: Record<string, number> = {};
  for (const review of reviews) {
    byVerdict[review.verdict] = (byVerdict[review.verdict] || 0) + 1;
    byTaskType[review.task_type || "unknown"] = (byTaskType[review.task_type || "unknown"] || 0) + 1;
    if (review.primary_failure_type) {
      byFailureType[review.primary_failure_type] = (byFailureType[review.primary_failure_type] || 0) + 1;
    }
  }
  return {
    total: reviews.length,
    pass: byVerdict.pass || 0,
    warning: byVerdict.warning || 0,
    fail: byVerdict.fail || 0,
    byFailureType,
    byTaskType,
    pendingCandidates,
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
