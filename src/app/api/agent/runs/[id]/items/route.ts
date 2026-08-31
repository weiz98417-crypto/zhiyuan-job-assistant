import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDurableAgentRuntime,
  isDurableAgentRuntimeAvailable,
} from "@/lib/agent/runtime/runtime-factory";
import { projectConversationItems } from "@/lib/agent/item-projection";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUserOrNull();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!isDurableAgentRuntimeAvailable()) {
      return NextResponse.json({ success: false, error: "Durable Agent Runtime unavailable" }, { status: 503 });
    }
    const { id } = await params;
    const runtime = getDurableAgentRuntime();
    const principal = { userId: user.userId };
    const run = await runtime.getRun(principal, id);
    if (!run) return NextResponse.json({ success: false, error: "Run not found" }, { status: 404 });
    const afterRaw = new URL(request.url).searchParams.get("after");
    const after = afterRaw === null ? 0 : Number(afterRaw);
    if (!Number.isFinite(after) || after < 0) {
      return NextResponse.json({ success: false, error: "Invalid item cursor" }, { status: 400 });
    }
    const events = await runtime.listEvents(principal, id, 0);
    const checkpoint = await runtime.getLatestCheckpoint(principal, id);
    const assistantText = latestAssistantText(checkpoint?.context);
    const items = projectConversationItems({
      conversationId: run.conversationId,
      runId: run.id,
      ownerId: user.userId,
      events,
      assistantText,
    });
    const cursor = events.at(-1)?.sequence || 0;
    const filtered = after > 0
      ? items.filter((item) => (item.eventCursor || 0) > Math.floor(after))
      : items;
    return NextResponse.json({
      success: true,
      data: { items: filtered, cursor, source: "conversation_item_projection", schemaVersion: 1 },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

function latestAssistantText(context: Record<string, unknown> | undefined): string | undefined {
  const messages = context?.conversationMessages;
  if (!Array.isArray(messages)) return undefined;
  const assistant = [...messages].reverse().find((message) => (
    message && typeof message === "object" && !Array.isArray(message)
    && (message as Record<string, unknown>).role === "assistant"
    && typeof (message as Record<string, unknown>).content === "string"
  ));
  return assistant && typeof assistant === "object" ? String((assistant as Record<string, unknown>).content || "") : undefined;
}

async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
