import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDurableAgentRuntime,
  isDurableAgentRuntimeAvailable,
} from "@/lib/agent/runtime/runtime-factory";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUserOrNull();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!isDurableAgentRuntimeAvailable()) {
      return NextResponse.json({ success: false, error: "Durable Agent Runtime unavailable" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const content = typeof body.input?.content === "string" ? body.input.content.trim() : "";
    if (!requestId) return NextResponse.json({ success: false, error: "requestId is required" }, { status: 400 });
    if (!content) return NextResponse.json({ success: false, error: "input.content is required" }, { status: 400 });

    const { id } = await params;
    const result = await getDurableAgentRuntime().submitInput(
      { userId: user.userId },
      id,
      requestId,
      {
        content,
        images: Array.isArray(body.input?.images) ? body.input.images.map(String) : undefined,
        ...(body.input?.persistInConversation === false ? { persistInConversation: false } : {}),
      },
    );
    return NextResponse.json(
      { success: true, data: result },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
