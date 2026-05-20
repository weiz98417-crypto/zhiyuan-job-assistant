import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/server-db";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    // Apply time-based decay before returning
    const rows = db.prepare("SELECT * FROM agent_preferences WHERE user_id = ?").all(user.userId) as Array<{
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
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const { entity_type, entity_key, weight, decay_rate } = await request.json();
    const db = getDb();
    db.prepare(
      `INSERT INTO agent_preferences (user_id, entity_type, entity_key, weight, decay_rate, last_updated)
       VALUES (?,?,?,?,?,datetime('now'))
       ON CONFLICT(entity_type, entity_key) DO UPDATE SET
         weight = excluded.weight, last_updated = datetime('now')`
    ).run(user.userId, entity_type, entity_key, weight || 1.0, decay_rate || 0.05);
return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
