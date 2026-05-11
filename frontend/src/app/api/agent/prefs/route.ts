import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";

function getDb() { return new Database(resolve(process.cwd(), "..", "data", "zhiyuan.db")); }

export async function GET() {
  try {
    const db = getDb();
    // Apply time-based decay before returning
    const rows = db.prepare("SELECT * FROM agent_preferences").all() as Array<{
      entity_type: string; entity_key: string; weight: number;
      decay_rate: number; last_updated: string;
    }>;
    db.close();

    const now = new Date();
    const effective = rows.map((r) => {
      const days = Math.max(0, (now.getTime() - new Date(r.last_updated).getTime()) / (1000 * 60 * 60 * 24));
      const decayed = r.weight * Math.exp(-r.decay_rate * days);
      return { ...r, weight: Math.round(decayed * 1000) / 1000, effective: decayed > 0.05 };
    }).filter((r) => r.effective);

    return NextResponse.json({ success: true, data: effective });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { entity_type, entity_key, weight, decay_rate } = await request.json();
    const db = getDb();
    db.prepare(
      `INSERT INTO agent_preferences (entity_type, entity_key, weight, decay_rate, last_updated)
       VALUES (?,?,?,?,datetime('now'))
       ON CONFLICT(entity_type, entity_key) DO UPDATE SET
         weight = excluded.weight, last_updated = datetime('now')`
    ).run(entity_type, entity_key, weight || 1.0, decay_rate || 0.05);
    db.close();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
