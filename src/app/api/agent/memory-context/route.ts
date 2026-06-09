import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({})) as {
      task?: string;
      agentId?: string;
      query?: string;
      budgetChars?: number;
      semanticTopK?: number;
      userTextTask?: string;
      contentTask?: string;
    };

    const context = await assembleAgentMemoryContext({
      userId: user.userId,
      task: body.task,
      agentId: body.agentId,
      query: body.query || "",
      budgetChars: body.budgetChars,
      semanticTopK: body.semanticTopK,
      userTextTask: body.userTextTask,
      contentTask: body.contentTask,
    });

    return NextResponse.json({ success: true, data: context });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Not authenticated" || message === "Invalid or expired token") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[agent/memory-context] failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
