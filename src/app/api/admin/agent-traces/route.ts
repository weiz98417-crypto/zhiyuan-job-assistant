import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/auth-guards";
import { getAgentTrace, listAgentTraces } from "@/lib/agent/runtime/agent-trace-store";

/** Spec 18: metadata-only trace reads for the admin panel. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const runId = new URL(request.url).searchParams.get("runId")?.trim() || "";
    if (runId) {
      const data = await getAgentTrace(runId);
      return NextResponse.json({ success: true, data });
    }
    const limit = Number(new URL(request.url).searchParams.get("limit") || 50);
    const data = await listAgentTraces(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "trace read failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
