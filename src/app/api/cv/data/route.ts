import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";
import { getCurrentUser } from "@/lib/auth";

function getDb() { return new Database(resolve(process.cwd(), "data", "zhiyuan.db")); }

export async function GET() {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const row = db.prepare("SELECT data_json FROM cv_data WHERE user_id = ?").get(user.userId) as { data_json: string } | undefined;
    db.close();
    if (!row) return NextResponse.json({ success: true, data: {} });
    return NextResponse.json({ success: true, data: JSON.parse(row.data_json) });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const db = getDb();
    const existing = db.prepare("SELECT id FROM cv_data WHERE user_id = ?").get(user.userId);
    if (existing) {
      db.prepare(
        "UPDATE cv_data SET data_json = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(JSON.stringify(body), user.userId);
    } else {
      db.prepare(
        "INSERT INTO cv_data (user_id, data_json, updated_at) VALUES (?, ?, datetime('now'))"
      ).run(user.userId, JSON.stringify(body));
    }
    db.close();
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
