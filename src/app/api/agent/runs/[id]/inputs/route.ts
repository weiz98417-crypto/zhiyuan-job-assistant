import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDurableAgentRuntime,
  isDurableAgentRuntimeAvailable,
} from "@/lib/agent/runtime/runtime-factory";
import { admitAgentRun } from "@/lib/agent/run-admission";
import type { AgentRunAdmissionDecision } from "@/lib/agent/run-admission";
import { runReceipt } from "@/lib/agent/runtime/run-receipt";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUserOrNull();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!isDurableAgentRuntimeAvailable()) {
      return NextResponse.json({ success: false, error: "Durable Agent Runtime unavailable" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const images = Array.isArray(body.input?.images) ? body.input.images.map(String) : [];
    const content = (typeof body.input?.content === "string" ? body.input.content.trim() : "")
      || (images.length > 0 ? "请识别这张图片，并根据图片内容帮助我处理。" : "");
    if (!requestId) return NextResponse.json({ success: false, error: "requestId is required" }, { status: 400 });
    if (!content) return NextResponse.json({ success: false, error: "input.content is required" }, { status: 400 });

    const { id } = await params;
    const runtime = getDurableAgentRuntime();
    const run = await runtime.getRun({ userId: user.userId }, id);
    if (!run) return NextResponse.json({ success: false, error: "Agent Run not found" }, { status: 404 });
    const input = {
      content,
      images: images.length > 0 ? images : undefined,
      ...(body.input?.persistInConversation === false ? { persistInConversation: false } : {}),
    };
    const admission = admitAgentRun({
      conversationId: run.conversationId,
      input,
      activeRun: run,
      entryHints: { source: "run_input" },
    });
    if (admission.kind !== "continue_current_run") {
      return NextResponse.json(
        { success: false, error: admission.safeMessage || "Agent Run input does not continue the current goal", data: { admission: admissionReceipt(admission) } },
        { status: 409 },
      );
    }
    const result = await runtime.submitInput(
      { userId: user.userId },
      id,
      requestId,
      input,
    );
    return NextResponse.json(
      {
        success: true,
        data: {
          run: runReceipt(result.run),
          input: {
            id: result.input.id,
            runId: result.input.runId,
            requestId: result.input.requestId,
            status: result.input.status,
            createdAt: result.input.createdAt,
            consumedAt: result.input.consumedAt,
          },
          replayed: result.replayed,
          admission: admissionReceipt(admission),
        },
      },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    const message = String(error);
    const status = message.includes("not accepting continuation input") ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

function admissionReceipt(admission: AgentRunAdmissionDecision) {
  return {
    kind: admission.kind,
    taskType: admission.taskType,
    agentId: admission.agentId,
    currentRunId: admission.currentRunId,
    safeMessage: admission.safeMessage,
    evidence: admission.evidence,
  };
}

async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
