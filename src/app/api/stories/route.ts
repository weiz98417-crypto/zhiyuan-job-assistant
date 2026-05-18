import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";
import { getCurrentUser } from "@/lib/auth";

function getDb() { return new Database(resolve(process.cwd(), "data", "zhiyuan.db")); }

export async function GET() {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const rows = db.prepare("SELECT * FROM stories WHERE user_id = ? ORDER BY created_at DESC").all(user.userId);
    db.close();
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const { title, situation, task, action, result, tags } = await request.json();
    const db = getDb();
    const r = db.prepare(
      "INSERT INTO stories (user_id, title, situation, task, action, result, tags_json) VALUES (?,?,?,?,?,?,?)"
    ).run(user.userId, title, situation || "", task || "", action || "", result || "", JSON.stringify(tags || []));
    const id = r.lastInsertRowid;
    db.close();
    return NextResponse.json({ success: true, data: { id: Number(id) } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
