import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/auth-guards";
import { getAgentEvidenceView } from "@/lib/agent/admin-evidence";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    await requireAdmin();
    const { runId } = await params;
    const data = await getAgentEvidenceView(runId);
    if (!data) return NextResponse.json({ success: false, error: "Agent Run not found" }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Forbidden") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    if (["Not authenticated", "Invalid or expired token", "Token has been revoked"].includes(message)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[admin/agent-evidence]", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
