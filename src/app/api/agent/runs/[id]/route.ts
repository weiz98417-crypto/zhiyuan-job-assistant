import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  cancelAgentRun,
  getAgentRun,
  isAgentRunLedgerAvailable,
  listAgentRunSteps,
  updateAgentRunStatus,
  type AgentRunStatus,
} from "@/lib/agent/run-ledger";

const VALID_STATUSES = new Set<AgentRunStatus>([
  "planned",
  "running",
  "waiting_user",
  "verifying",
  "repairing",
  "succeeded",
  "failed",
  "rolled_back",
  "cancelled",
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const run = await getAgentRun(id, user.userId);
    if (!run) return NextResponse.json({ success: false, error: "Run not found" }, { status: 404 });
    const steps = await listAgentRunSteps(id);
    return NextResponse.json({ success: true, data: { run, steps } });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const status = typeof body.status === "string" ? body.status : "";
    if (!VALID_STATUSES.has(status as AgentRunStatus)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const run = await updateAgentRunStatus(id, status as AgentRunStatus, {
      result: body.result,
      error: body.error,
    });
    return NextResponse.json({ success: true, data: run });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const ok = await cancelAgentRun(id, user.userId);
    if (!ok) return NextResponse.json({ success: false, error: "Run not found or not active" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
