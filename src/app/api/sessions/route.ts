import { NextResponse } from "next/server";
import { getCurrentUser } from '@/lib/auth';
import { getDb } from "@/lib/server-db";

export async function GET() {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const db = getDb();
    const rows = db.prepare(`
      SELECT id, title, messages_json, memory_digest, interview_state_json, pinned, deleted_at, created_at, updated_at
      FROM sessions
      WHERE deleted_at IS NULL AND user_id = ?
      ORDER BY updated_at DESC
      LIMIT 50
    `).all(user.userId);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const { title, messages, interviewState } = await request.json();
    const db = getDb();
    const result = db.prepare(
      "INSERT INTO sessions (title, messages_json, interview_state_json, user_id) VALUES (?, ?, ?, ?)"
    ).run(title || "新对话", JSON.stringify(messages || []), JSON.stringify(interviewState || {}), user.userId);
    const id = result.lastInsertRowid;
return NextResponse.json({ success: true, data: { id: Number(id), title } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
