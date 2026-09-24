import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  projectSessionMutationForPersistence,
  projectSessionRowForUser,
} from "@/lib/agent/surface-projection";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const row = await getDataRepositories().sessions.get(Number(id), user.userId);
    if (!row) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: projectSessionRowForUser(row) });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const raw = await request.json();
    // 0.11.0-C (ADR-0030): the worker is the sole transcript writer. The
    // browser may update session metadata but never the messages array.
    if (raw && typeof raw === "object" && "messages" in raw) {
      return NextResponse.json(
        { success: false, error: "messages 由 Agent Worker 独占写入；客户端请通过 durable Run 提交内容。" },
        { status: 422 },
      );
    }
    const body = projectSessionMutationForPersistence(raw);
    const ok = await getDataRepositories().sessions.update(Number(id), user.userId, body);
    if (!ok) return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
