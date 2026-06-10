import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createAgentRun,
  isAgentRunLedgerAvailable,
  listActiveAgentRuns,
} from "@/lib/agent/run-ledger";

export async function GET(request: Request) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAgentRunLedgerAvailable()) {
      return NextResponse.json({ success: true, enabled: false, data: [] });
    }

    const url = new URL(request.url);
    const rawSessionId = url.searchParams.get("sessionId");
    const sessionId = rawSessionId ? Number(rawSessionId) : undefined;
    if (rawSessionId && !Number.isFinite(sessionId)) {
      return NextResponse.json({ success: false, error: "Invalid sessionId" }, { status: 400 });
    }

    const rows = await listActiveAgentRuns(user.userId, sessionId);
    return NextResponse.json({ success: true, enabled: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => ({}));
    const taskType = typeof body.taskType === "string" ? body.taskType.trim() : "";
    if (!taskType) {
      return NextResponse.json({ success: false, error: "taskType is required" }, { status: 400 });
    }

    const sessionId =
      body.sessionId === null || body.sessionId === undefined || body.sessionId === ""
        ? null
        : Number(body.sessionId);
    if (sessionId !== null && !Number.isFinite(sessionId)) {
      return NextResponse.json({ success: false, error: "Invalid sessionId" }, { status: 400 });
    }

    const run = await createAgentRun({
      userId: user.userId,
      sessionId,
      taskType,
      agentId: typeof body.agentId === "string" ? body.agentId : "",
      contract: body.contract && typeof body.contract === "object" ? body.contract : {},
    });

    return NextResponse.json({ success: true, data: run }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
