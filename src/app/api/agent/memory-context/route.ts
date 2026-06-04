import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assembleAgentMemoryContext, type AgentMemoryTask } from "@/lib/agent/memory-context";

const TASKS = new Set(["jd", "offer", "resume", "interview", "profile", "general_chat"]);

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({})) as {
      task?: string;
      query?: string;
      budgetChars?: number;
      semanticTopK?: number;
    };

    const task = TASKS.has(body.task || "") ? body.task as AgentMemoryTask : "general_chat";
    const context = await assembleAgentMemoryContext({
      userId: user.userId,
      task,
      query: body.query || "",
      budgetChars: body.budgetChars,
      semanticTopK: body.semanticTopK,
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
