import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";

function getDb() {
  return new Database(resolve(process.cwd(), "..", "data", "zhiyuan.db"));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(Number(id));
    db.close();
    if (!row) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (body.title !== undefined) { sets.push("title = ?"); vals.push(body.title); }
    if (body.messages !== undefined) { sets.push("messages_json = ?"); vals.push(JSON.stringify(body.messages)); }
    if (body.pinned !== undefined) { sets.push("pinned = ?"); vals.push(body.pinned ? 1 : 0); }
    if (body.memoryDigest !== undefined) { sets.push("memory_digest = ?"); vals.push(body.memoryDigest); }
    if (body.deleted !== undefined) {
      sets.push("deleted_at = ?");
      vals.push(body.deleted ? new Date().toISOString() : null);
    }

    if (sets.length === 0) {
      db.close();
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    sets.push("updated_at = datetime('now')");
    vals.push(Number(id));

    db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    db.close();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
