import { NextResponse } from "next/server";
import { getCurrentUser } from '@/lib/auth';
import Database from "better-sqlite3";
import { resolve } from "path";

function getDb() {
  return new Database(resolve(process.cwd(), "data", "zhiyuan.db"));
}

export async function GET() {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const db = getDb();
    const rows = db.prepare(
      "SELECT id, title, pinned, created_at, updated_at FROM sessions WHERE deleted_at IS NULL AND user_id = ? ORDER BY updated_at DESC LIMIT 50"
    ).all(user.userId);
    db.close();
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const { title, messages } = await request.json();
    const db = getDb();
    const result = db.prepare(
      "INSERT INTO sessions (title, messages_json, user_id) VALUES (?, ?, ?)"
    ).run(title || "新对话", JSON.stringify(messages || []), user.userId);
    const id = result.lastInsertRowid;
    db.close();
    return NextResponse.json({ success: true, data: { id: Number(id), title } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
