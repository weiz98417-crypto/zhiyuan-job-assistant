import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAgentRunLedgerAvailable } from "@/lib/agent/run-ledger";
import {
  createSessionAnomalyEvalCandidates,
  reviewAgentSessionAnomalies,
  type AgentSessionReviewMessage,
} from "@/lib/agent/run-review";

function cleanMessages(value: unknown): AgentSessionReviewMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      role: typeof record.role === "string" ? record.role : "unknown",
      content: typeof record.content === "string" ? record.content : "",
      images: Array.isArray(record.images)
        ? record.images.filter((src): src is string => typeof src === "string")
        : undefined,
      toolName: typeof record.toolName === "string" ? record.toolName : undefined,
      toolResult: record.toolResult,
      agent_id: typeof record.agent_id === "string" ? record.agent_id : undefined,
    };
  });
}

function cleanActiveTask(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    taskId: typeof record.taskId === "string" ? record.taskId : undefined,
    taskType: typeof record.taskType === "string" ? record.taskType : undefined,
    agentId: typeof record.agentId === "string" ? record.agentId : undefined,
    phase: typeof record.phase === "string" ? record.phase : undefined,
  };
}

function cleanRecentRuns(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-5).map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: typeof record.id === "string" ? record.id : "",
      task_type: typeof record.task_type === "string" ? record.task_type : "",
      agent_id: typeof record.agent_id === "string" ? record.agent_id : "",
      status: typeof record.status === "string" ? record.status as never : "planned" as never,
    };
  }).filter((item) => item.id || item.task_type || item.agent_id);
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
      return NextResponse.json({ success: true, enabled: false, data: [] });
    }

    const body = await request.json().catch(() => ({}));
    const input = {
      userId: user.userId,
      sessionId: body.sessionId === undefined || body.sessionId === null ? null : Number(body.sessionId),
      messages: cleanMessages(body.messages),
      activeTask: cleanActiveTask(body.activeTask),
      recentRuns: cleanRecentRuns(body.recentRuns),
    };
    if (input.sessionId !== null && !Number.isFinite(input.sessionId)) {
      return NextResponse.json({ success: false, error: "Invalid sessionId" }, { status: 400 });
    }

    const planned = reviewAgentSessionAnomalies(input);
    if (planned.length === 0) {
      return NextResponse.json({ success: true, enabled: true, data: [] });
    }
    const saved = await createSessionAnomalyEvalCandidates(input);
    return NextResponse.json({ success: true, enabled: true, data: saved });
  } catch (err) {
    console.error("[agent/session-review]", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
