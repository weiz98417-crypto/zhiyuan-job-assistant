import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/auth-guards";
import {
  isAgentRunLedgerAvailable,
  listRecentAgentRuns,
  listRecentFailedAgentRuns,
  type AgentRunDebugRecord,
  type AgentRunStepRecord,
  type AgentRunStatus,
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
  const contractJson = run.contract_json as Record<string, unknown> | null;
  const routing = contractJson?.routing && typeof contractJson.routing === "object"
    ? contractJson.routing as Record<string, unknown>
    : {};
  return {
    id: run.id,
    userId: run.user_id,
    sessionId: run.session_id,
    taskType: run.task_type,
    agentId: run.agent_id,
    status: run.status,
    contract: {
      taskType: typeof contractJson?.taskType === "string"
        ? contractJson.taskType
        : run.task_type,
      target: redactText(contractJson?.target || ""),
      successCriteria: Array.isArray(contractJson?.successCriteria)
        ? (contractJson.successCriteria as unknown[]).map(redactText).slice(0, 8)
        : [],
      validators: Array.isArray(contractJson?.validators)
        ? (contractJson.validators as unknown[]).map(redactText).slice(0, 8)
        : [],
      routing: {
        contractPolicy: redactText(routing.contractPolicy || ""),
        memoryTask: redactText(routing.memoryTask || ""),
        allowedTools: Array.isArray(routing.allowedTools)
          ? routing.allowedTools.map(redactText).slice(0, 20)
          : [],
        requiresClarification: routing.requiresClarification === true,
        clarificationQuestion: redactText(routing.clarificationQuestion || ""),
        blockedReason: redactText(routing.blockedReason || ""),
        auditSummary: redactText(routing.auditSummary || ""),
        activeTaskId: redactText(routing.activeTaskId || ""),
        activeTaskType: redactText(routing.activeTaskType || ""),
        activeTaskPhase: redactText(routing.activeTaskPhase || ""),
        routeLocked: routing.routeLocked === true,
      },
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
    await requireAdmin();

    if (!isAgentRunLedgerAvailable()) {
      return NextResponse.json({ success: true, enabled: false, data: [] });
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    const status = cleanStatusFilter(url.searchParams.get("status"));
    const rows = status === "failed"
      ? await listRecentFailedAgentRuns(Number.isFinite(limit) ? limit : 50)
      : await listRecentAgentRuns(Number.isFinite(limit) ? limit : 50, status ? [status] : undefined);
    const data = rows.map(toRunSummary);
    return NextResponse.json({
      success: true,
      enabled: true,
      summary: buildSummary(data),
      data,
    });
  } catch (err) {
    const authError = err as { status?: unknown; code?: unknown };
    if (authError.status === 401 || authError.status === 403) {
      return NextResponse.json({
        success: false,
        error: authError.status === 401 ? "Unauthorized" : "Forbidden",
        code: typeof authError.code === "string" ? authError.code : undefined,
      }, { status: authError.status });
    }
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

function cleanStatusFilter(value: string | null): AgentRunStatus | "failed" | undefined {
  const status = (value || "").trim();
  if (!status || status === "all") return undefined;
  if (status === "failed") return "failed";
  const allowed = new Set<AgentRunStatus>([
    "planned",
    "running",
    "waiting_user",
    "verifying",
    "repairing",
    "recovered",
    "needs_engineering",
    "succeeded",
    "failed",
    "rolled_back",
    "cancelled",
  ]);
  return allowed.has(status as AgentRunStatus) ? status as AgentRunStatus : undefined;
}

function buildSummary(rows: ReturnType<typeof toRunSummary>[]) {
  const byStatus: Record<string, number> = {};
  const byTaskType: Record<string, number> = {};
  let failedSteps = 0;
  let totalSteps = 0;

  for (const run of rows) {
    byStatus[run.status] = (byStatus[run.status] || 0) + 1;
    byTaskType[run.taskType || "unknown"] = (byTaskType[run.taskType || "unknown"] || 0) + 1;
    for (const step of run.recentSteps) {
      totalSteps += 1;
      if (step.status === "failed") failedSteps += 1;
    }
  }

  return {
    totalRuns: rows.length,
    failedRuns: rows.filter((run) => run.status === "failed" || run.status === "rolled_back").length,
    activeRuns: rows.filter((run) => ["planned", "running", "waiting_user", "verifying", "repairing"].includes(run.status)).length,
    succeededRuns: rows.filter((run) => run.status === "succeeded").length,
    failedSteps,
    totalSteps,
    byStatus,
    byTaskType,
  };
}
