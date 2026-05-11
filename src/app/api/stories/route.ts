import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";

function getDb() { return new Database(resolve(process.cwd(), "data", "zhiyuan.db")); }

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM stories ORDER BY created_at DESC").all();
    db.close();
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { title, situation, task, action, result, tags } = await request.json();
    const db = getDb();
    const r = db.prepare(
      "INSERT INTO stories (title, situation, task, action, result, tags_json) VALUES (?,?,?,?,?,?)"
    ).run(title, situation || "", task || "", action || "", result || "", JSON.stringify(tags || []));
    const id = r.lastInsertRowid;
    db.close();
    return NextResponse.json({ success: true, data: { id: Number(id) } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
