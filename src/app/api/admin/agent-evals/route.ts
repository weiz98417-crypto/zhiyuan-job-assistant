import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/auth-guards";
import {
  createAgentEvalRun,
  listAgentEvalRuns,
  normalizeEvalRunMode,
  normalizeEvalRunStatus,
} from "@/lib/agent/eval-runs";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const url = new URL(request.url);
    const data = await listAgentEvalRuns({
      limit: Number(url.searchParams.get("limit") || 50),
      mode: url.searchParams.get("mode") ? normalizeEvalRunMode(url.searchParams.get("mode")) : undefined,
      status: url.searchParams.get("status") ? normalizeEvalRunStatus(url.searchParams.get("status")) : undefined,
      fixtureId: url.searchParams.get("fixtureId") || undefined,
    });
    return NextResponse.json({ success: true, actor: admin.userId, data });
  } catch (error) {
    return handleError(error, "[admin/agent-evals] GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid Eval Run payload" }, { status: 400 });
    }
    const fixtureId = typeof body.fixtureId === "string" ? body.fixtureId.trim() : "";
    const fixtureVersion = typeof body.fixtureVersion === "string" ? body.fixtureVersion.trim() : "";
    const graphVersion = typeof body.graphVersion === "string" ? body.graphVersion.trim() : "";
    if (!fixtureId || !fixtureVersion || !graphVersion) {
      return NextResponse.json({ success: false, error: "fixtureId, fixtureVersion and graphVersion are required" }, { status: 400 });
    }
    const data = await createAgentEvalRun({
      createdByUserId: admin.userId,
      mode: body.mode,
      status: body.status,
      codeCommit: body.codeCommit,
      modelVersion: body.modelVersion,
      promptVersion: body.promptVersion,
      toolVersion: body.toolVersion,
      fixtureId,
      fixtureVersion,
      graphVersion,
      judgeVersion: body.judgeVersion,
      score: body.score,
      hardGatePassed: body.hardGatePassed === true,
      gateResults: body.gateResults,
      failureEvidence: body.failureEvidence,
      reviewId: Number.isFinite(Number(body.reviewId)) ? Number(body.reviewId) : null,
      candidateId: Number.isFinite(Number(body.candidateId)) ? Number(body.candidateId) : null,
      metadata: body.metadata,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return handleError(error, "[admin/agent-evals] POST");
  }
}

function handleError(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Forbidden") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  if (["Not authenticated", "Invalid or expired token", "Token has been revoked"].includes(message)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  console.error(label, error);
  return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
}
