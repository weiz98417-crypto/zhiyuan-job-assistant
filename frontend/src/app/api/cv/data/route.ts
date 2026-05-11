import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";

function getDb() { return new Database(resolve(process.cwd(), "..", "data", "zhiyuan.db")); }

export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT data_json FROM cv_data WHERE id = 1").get() as { data_json: string } | undefined;
    db.close();
    if (!row) return NextResponse.json({ success: true, data: {} });
    return NextResponse.json({ success: true, data: JSON.parse(row.data_json) });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();
    db.prepare(
      "INSERT INTO cv_data (id, data_json, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = datetime('now')"
    ).run(JSON.stringify(body));
    db.close();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
