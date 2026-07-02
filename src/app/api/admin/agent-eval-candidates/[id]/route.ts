import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { isAgentRunLedgerAvailable } from "@/lib/agent/run-ledger";
import {
  transitionAgentEvalCandidate,
  type AgentEvalCandidateStatus,
} from "@/lib/agent/run-review";

async function ensureAdmin() {
  const payload = await getCurrentUser();
  if (payload.role !== "admin") throw new Error("Forbidden");
  await verifyTokenVersion(payload);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureAdmin();
    if (!isAgentRunLedgerAvailable()) {
      return NextResponse.json({ success: false, error: "Agent review ledger is disabled" }, { status: 503 });
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status = normalizeStatus(body.status || body.action);
    if (!status) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }
    const result = await transitionAgentEvalCandidate(
      Number(id),
      status,
      typeof body.adminNote === "string" ? body.adminNote : "",
    );
    if (!result) {
      return NextResponse.json({ success: false, error: "Eval candidate not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result.candidate, lifecycle: result.lifecycle });
  } catch (error) {
    return handleAdminReviewError(error, "[admin/agent-eval-candidates/:id] PATCH");
  }
}

function normalizeStatus(value: unknown): AgentEvalCandidateStatus | null {
  const text = String(value || "").trim();
  if (text === "accept") return "accepted";
  if (text === "reject") return "rejected";
  if (text === "promote") return "promoted";
  if (text === "candidate" || text === "accepted" || text === "rejected" || text === "promoted") return text;
  return null;
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
