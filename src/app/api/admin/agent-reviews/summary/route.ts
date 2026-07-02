import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { isAgentRunLedgerAvailable } from "@/lib/agent/run-ledger";
import { getAgentRunReviewSummary } from "@/lib/agent/run-review";

async function ensureAdmin() {
  const payload = await getCurrentUser();
  if (payload.role !== "admin") throw new Error("Forbidden");
  await verifyTokenVersion(payload);
}

export async function GET(request: NextRequest) {
  try {
    await ensureAdmin();
    if (!isAgentRunLedgerAvailable()) {
      return NextResponse.json({ success: true, enabled: false, data: null });
    }
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") || 7);
    const summary = await getAgentRunReviewSummary(Number.isFinite(days) ? days : 7);
    return NextResponse.json({
      success: true,
      enabled: true,
      data: summary,
    });
  } catch (error) {
    return handleAdminReviewError(error, "[admin/agent-reviews/summary] GET");
  }
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
