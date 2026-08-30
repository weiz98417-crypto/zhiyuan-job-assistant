import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDurableAgentRuntime,
  isDurableAgentRuntimeAvailable,
} from "@/lib/agent/runtime/runtime-factory";
import { resolveAgentRuntimeAssignment } from "@/lib/agent/runtime/runtime-mode";

export async function GET(request: Request) {
  try {
    const user = await currentUserOrNull();
    if (!user) return unauthorized();
    if (!isDurableAgentRuntimeAvailable()) {
      return NextResponse.json({ success: true, enabled: false, data: [] });
    }

    const url = new URL(request.url);
    const rawConversationId = url.searchParams.get("conversationId") || url.searchParams.get("sessionId");
    const conversationId = parseOptionalNumber(rawConversationId);
    if (rawConversationId && conversationId === undefined) return invalid("Invalid conversationId");
    const activeOnly = url.searchParams.get("activeOnly") !== "false";
    const rows = await getDurableAgentRuntime().listRuns(
      { userId: user.userId },
      { conversationId, activeOnly },
    );
    return NextResponse.json({ success: true, enabled: true, data: rows });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await currentUserOrNull();
    if (!user) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const requestId = stringField(body.requestId);
    const taskType = stringField(body.taskType);
    const agentId = stringField(body.agentId);
    const content = stringField(body.input?.content);
    if (!requestId) return invalid("requestId is required");
    if (!taskType) return invalid("taskType is required");
    if (!agentId) return invalid("agentId is required");
    if (!content) return invalid("input.content is required");

    const rawConversationId = body.conversationId ?? body.sessionId ?? null;
    const conversationId = rawConversationId === null ? null : parseOptionalNumber(String(rawConversationId));
    if (rawConversationId !== null && conversationId === undefined) return invalid("Invalid conversationId");

    const assignment = resolveAgentRuntimeAssignment(user.userId, taskType);
    if (assignment.owner !== "worker") {
      return NextResponse.json({
        success: true,
        enabled: false,
        data: { run: null, replayed: false, assignment },
      });
    }
    if (!isDurableAgentRuntimeAvailable()) {
      return NextResponse.json(
        { success: false, error: "Durable Agent Runtime unavailable" },
        { status: 503 },
      );
    }

    const result = await getDurableAgentRuntime().createRun(
      { userId: user.userId },
      {
        requestId,
        conversationId: conversationId ?? null,
        taskType,
        agentId,
        input: {
          content,
          images: Array.isArray(body.input?.images) ? body.input.images.map(String) : undefined,
          ...(body.input?.persistInConversation === false ? { persistInConversation: false } : {}),
        },
        contract: objectField(body.contract),
        runtimeMode: assignment.mode === "worker_readonly" ? "worker_readonly" : "worker_all",
        parentRunId: stringField(body.parentRunId) || null,
      },
    );
    return NextResponse.json(
      { success: true, enabled: true, data: { ...result, assignment } },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    return failure(error);
  }
}

async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function invalid(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function failure(error: unknown) {
  return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
}
