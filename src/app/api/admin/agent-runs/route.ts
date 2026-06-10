import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import {
  isAgentRunLedgerAvailable,
  listRecentFailedAgentRuns,
  type AgentRunDebugRecord,
  type AgentRunStepRecord,
} from "@/lib/agent/run-ledger";

const MAX_TEXT = 180;

function redactText(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text
    .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "[image]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/1[3-9]\d{9}/g, "[phone]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

function safeJson(value: unknown): unknown {
  if (!value || typeof value !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => (
      typeof item === "string" ? redactText(item) : item
    )));
  } catch {
    return { summary: redactText(value) };
  }
}

function toStepSummary(step: AgentRunStepRecord) {
  return {
    id: step.id,
    phase: step.phase,
    toolName: step.tool_name,
    status: step.status,
    inputSummary: redactText(step.input_summary),
    outputSummary: redactText(step.output_summary),
    verifier: safeJson(step.verifier_json),
    error: safeJson(step.error_json),
    createdAt: step.created_at,
  };
}

function toRunSummary(run: AgentRunDebugRecord) {
  return {
    id: run.id,
    userId: run.user_id,
    sessionId: run.session_id,
    taskType: run.task_type,
    agentId: run.agent_id,
    status: run.status,
    contract: {
      taskType: typeof (run.contract_json as { taskType?: unknown })?.taskType === "string"
        ? (run.contract_json as { taskType: string }).taskType
        : run.task_type,
      target: redactText((run.contract_json as { target?: unknown })?.target || ""),
      successCriteria: Array.isArray((run.contract_json as { successCriteria?: unknown })?.successCriteria)
        ? ((run.contract_json as { successCriteria: unknown[] }).successCriteria).map(redactText).slice(0, 8)
        : [],
      validators: Array.isArray((run.contract_json as { validators?: unknown })?.validators)
        ? ((run.contract_json as { validators: unknown[] }).validators).map(redactText).slice(0, 8)
        : [],
    },
    result: safeJson(run.result_json),
    error: safeJson(run.error_json),
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    recentSteps: run.recent_steps.map(toStepSummary),
  };
}

export async function GET(request: NextRequest) {
  try {
    const payload = await getCurrentUser();
    if (payload.role !== "admin") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    await verifyTokenVersion(payload);

    if (!isAgentRunLedgerAvailable()) {
      return NextResponse.json({ success: true, enabled: false, data: [] });
    }

    const limit = Number(new URL(request.url).searchParams.get("limit") || 50);
    const rows = await listRecentFailedAgentRuns(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({
      success: true,
      enabled: true,
      data: rows.map(toRunSummary),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message === "Not authenticated" ||
      message === "Invalid or expired token" ||
      message === "Token has been revoked"
    ) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[admin/agent-runs]", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
