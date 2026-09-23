import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDurableAgentRuntime,
  isDurableAgentRuntimeAvailable,
} from "@/lib/agent/runtime/runtime-factory";
import { resolveAgentRuntimeAssignment } from "@/lib/agent/runtime/runtime-mode";
import { admitAgentRun } from "@/lib/agent/run-admission";
import { resolveIntentEnvelope } from "@/lib/agent/intent-envelope";

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
    const content = stringField(body.input?.content);
    if (!requestId) return invalid("requestId is required");
    if (!content) return invalid("input.content is required");

    const rawConversationId = body.conversationId ?? body.sessionId ?? null;
    const conversationId = rawConversationId === null ? null : parseOptionalNumber(String(rawConversationId));
    if (rawConversationId !== null && conversationId === undefined) return invalid("Invalid conversationId");

    if (!isDurableAgentRuntimeAvailable()) {
      return NextResponse.json(
        { success: false, error: "Durable Agent Runtime unavailable" },
        { status: 503 },
      );
    }

    const runtime = getDurableAgentRuntime();
    const activeRuns = conversationId === null
      ? []
      : await runtime.listRuns({ userId: user.userId }, { conversationId, activeOnly: true, limit: 10 });
    const activeRun = activeRuns.find((candidate) => candidate.status !== "paused") || null;
    const input = {
      content,
      images: Array.isArray(body.input?.images) ? body.input.images.map(String) : undefined,
      ...(body.input?.persistInConversation === false ? { persistInConversation: false } : {}),
    };
    // M2: structured intent routing — one envelope call decides the task.
    const envelope = await resolveIntentEnvelope({
      content,
      agentId: stringField(body.entryHints?.agentId) || stringField(body.agentId) || undefined,
    });
    const admission = admitAgentRun({
      conversationId: conversationId ?? null,
      input,
      activeRun,
      envelope,
      entryHints: {
        agentId: stringField(body.entryHints?.agentId) || stringField(body.agentId) || undefined,
        taskType: stringField(body.taskType) || undefined,
        source: stringField(body.entryHints?.source) || undefined,
        imageDocumentType: parseImageDocumentType(body.entryHints?.imageDocumentType),
        journeyArtifacts: parseJourneyArtifacts(body.entryHints?.journeyArtifacts),
      },
    });
    if (admission.kind === "reject") {
      return NextResponse.json(
        { success: false, error: admission.safeMessage || "Agent Run admission rejected", data: { admission } },
        { status: 400 },
      );
    }

    const assignment = resolveAgentRuntimeAssignment(user.userId, admission.taskType!);
    if (assignment.owner !== "worker") {
      return NextResponse.json({
        success: true,
        enabled: false,
        data: { run: null, replayed: false, assignment, admission },
      });
    }

    if (admission.kind === "continue_current_run") {
      const result = await runtime.submitInput(
        { userId: user.userId },
        admission.currentRunId!,
        requestId,
        input,
      );
      return NextResponse.json(
        { success: true, enabled: true, data: { run: result.run, replayed: result.replayed, assignment, admission } },
        { status: result.replayed ? 200 : 201 },
      );
    }
    if (admission.kind === "defer_switch") {
      return NextResponse.json(
        { success: true, enabled: true, data: { run: activeRun, replayed: false, assignment, admission } },
        { status: 202 },
      );
    }

    const result = await runtime.createRun(
      { userId: user.userId },
      {
        requestId,
        conversationId: conversationId ?? null,
        taskType: admission.taskType!,
        agentId: admission.agentId!,
        input,
        contract: admission.contract,
        runtimeMode: assignment.mode === "worker_readonly" ? "worker_readonly" : "worker_all",
        // M4: child runs attribute through parent_run_id (depth/limits enforced
        // by the stores). The HTTP surface is the only door that was missing.
        ...(parseParentRunId(body.parentRunId) ? { parentRunId: parseParentRunId(body.parentRunId) } : {}),
      },
    );
    return NextResponse.json(
      { success: true, enabled: true, data: { ...result, assignment, admission } },
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

const IMAGE_DOCUMENT_TYPES = new Set(["jd", "offer", "resume"]);

function parseImageDocumentType(value: unknown): "jd" | "offer" | "resume" | undefined {
  return typeof value === "string" && IMAGE_DOCUMENT_TYPES.has(value)
    ? value as "jd" | "offer" | "resume"
    : undefined;
}

function parseParentRunId(value: unknown): string | undefined {
  const id = typeof value === "string" ? value.trim() : "";
  return id ? id.slice(0, 80) : undefined;
}

function parseJourneyArtifacts(value: unknown): Array<{
  artifactId: string;
  kind: string;
  version: string;
  hash: string;
  stale?: boolean;
}> | undefined {
  if (!Array.isArray(value)) return undefined;
  const artifacts = value
    .slice(0, 12)
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      artifactId: stringField(item.artifactId).slice(0, 120),
      kind: stringField(item.kind).slice(0, 40),
      version: stringField(item.version).slice(0, 80),
      hash: stringField(item.hash).slice(0, 200),
      ...(item.stale === true ? { stale: true as const } : {}),
    }))
    .filter((item) => item.artifactId && item.kind && item.version && item.hash);
  return artifacts.length > 0 ? artifacts : undefined;
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
