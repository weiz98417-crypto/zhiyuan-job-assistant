import { NextResponse } from "next/server";
import { getCurrentUser } from '@/lib/auth';
import { getDb } from "@/lib/server-db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const { id } = await params;
    const db = getDb();
    const row = db.prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?").get(Number(id), user.userId);
if (!row) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const { id } = await params;
    const body = await request.json();
    const db = getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (body.title !== undefined) { sets.push("title = ?"); vals.push(body.title); }
    if (body.messages !== undefined) { sets.push("messages_json = ?"); vals.push(JSON.stringify(body.messages)); }
    if (body.pinned !== undefined) { sets.push("pinned = ?"); vals.push(body.pinned ? 1 : 0); }
    if (body.memoryDigest !== undefined) { sets.push("memory_digest = ?"); vals.push(body.memoryDigest); }
    if (body.interviewState !== undefined) { sets.push("interview_state_json = ?"); vals.push(JSON.stringify(body.interviewState || {})); }
    if (body.deleted !== undefined) {
      sets.push("deleted_at = ?");
      vals.push(body.deleted ? new Date().toISOString() : null);
    }

    if (sets.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    sets.push("updated_at = datetime('now')");
    vals.push(Number(id));
    vals.push(user.userId);

    db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...vals);
return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
