import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  projectSessionMutationForPersistence,
  projectSessionRowForUser,
} from "@/lib/agent/surface-projection";

export async function GET() {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rows = await getDataRepositories().sessions.list(user.userId);
    return NextResponse.json({ success: true, data: rows.map(projectSessionRowForUser) });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const raw = await request.json();
    // 0.11.0-C (ADR-0030): sessions are created with an empty transcript; the
    // worker writes all conversation content afterwards.
    if (raw && typeof raw === "object" && "messages" in raw) {
      return NextResponse.json(
        { success: false, error: "messages 由 Agent Worker 独占写入；新会话请勿携带消息。" },
        { status: 422 },
      );
    }
    const { title, interviewState, agentState } = projectSessionMutationForPersistence(raw);
    const messages: unknown[] = [];
    const id = await getDataRepositories().sessions.create({ title, messages, interviewState, agentState }, user.userId);
    return NextResponse.json({ success: true, data: { id: Number(id), title } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
