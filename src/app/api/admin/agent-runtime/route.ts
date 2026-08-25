import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/auth-guards";
import {
  getAgentRuntimeAdminService,
  type RuntimeAdminAction,
  type RuntimeAdminCommand,
} from "@/lib/agent/runtime/runtime-admin";

const ACTIONS = new Set<RuntimeAdminAction>([
  "pause_claims",
  "resume_claims",
  "isolate_run",
  "cancel_run",
  "retry_dead_letter",
  "resolve_reconciliation",
]);

export async function GET() {
  try {
    await requireAdmin();
    const data = await getAgentRuntimeAdminService().getStatus();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() as RuntimeAdminAction : null;
    if (!requestId) return NextResponse.json({ success: false, error: "requestId is required" }, { status: 400 });
    if (!action || !ACTIONS.has(action)) {
      return NextResponse.json({ success: false, error: "Invalid Agent Runtime Admin action" }, { status: 400 });
    }
    const command: RuntimeAdminCommand = {
      requestId,
      action,
      reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : undefined,
      runId: typeof body.runId === "string" ? body.runId : undefined,
      outboxId: body.outboxId === undefined ? undefined : Number(body.outboxId),
      attemptId: typeof body.attemptId === "string" ? body.attemptId : undefined,
      resolution: ["verified", "not_executed", "manual_failed"].includes(body.resolution)
        ? body.resolution
        : undefined,
    };
    const data = await getAgentRuntimeAdminService().execute({ userId: admin.userId }, command);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return adminError(error);
  }
}

function adminError(error: unknown) {
  const status = error && typeof error === "object" && "status" in error
    ? Number(error.status)
    : 500;
  if (status === 401 || status === 403) {
    return NextResponse.json(
      { success: false, error: status === 401 ? "Unauthorized" : "Forbidden" },
      { status },
    );
  }
  return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
}
