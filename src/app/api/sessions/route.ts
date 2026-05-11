import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";

function getDb() {
  return new Database(resolve(process.cwd(), "data", "zhiyuan.db"));
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, title, pinned, created_at, updated_at FROM sessions WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50"
    ).all();
    db.close();
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { title, messages } = await request.json();
    const db = getDb();
    const result = db.prepare(
      "INSERT INTO sessions (title, messages_json) VALUES (?, ?)"
    ).run(title || "新对话", JSON.stringify(messages || []));
    const id = result.lastInsertRowid;
    db.close();
    return NextResponse.json({ success: true, data: { id: Number(id), title } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
