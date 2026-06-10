import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  appendAgentRunStep,
  getAgentRun,
  isAgentRunLedgerAvailable,
} from "@/lib/agent/run-ledger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAgentRunLedgerAvailable()) {
      return NextResponse.json({ success: false, error: "Agent run ledger unavailable" }, { status: 503 });
    }

    const { id } = await params;
    const existing = await getAgentRun(id, user.userId);
    if (!existing) return NextResponse.json({ success: false, error: "Run not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const phase = typeof body.phase === "string" ? body.phase.trim() : "";
    if (!phase) {
      return NextResponse.json({ success: false, error: "phase is required" }, { status: 400 });
    }

    const step = await appendAgentRunStep({
      runId: id,
      phase,
      toolName: typeof body.toolName === "string" ? body.toolName : "",
      status: typeof body.status === "string" ? body.status : "running",
      inputSummary: typeof body.inputSummary === "string" ? body.inputSummary : "",
      outputSummary: typeof body.outputSummary === "string" ? body.outputSummary : "",
      verifier: body.verifier && typeof body.verifier === "object" ? body.verifier : {},
      error: body.error && typeof body.error === "object" ? body.error : {},
    });

    return NextResponse.json({ success: true, data: step }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
