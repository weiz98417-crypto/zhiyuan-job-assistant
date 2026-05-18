import { NextResponse } from "next/server";
import { getCurrentUser } from '@/lib/auth';
import { getDb, type AppRow } from "@/lib/server-db";

export async function GET(request: Request) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const { searchParams } = new URL(request.url);
    const db = getDb();
    let sql = "SELECT * FROM applications WHERE user_id = ?";
    const params: unknown[] = [user.userId];

    const status = searchParams.get("status");
    if (status) { sql += " AND status = ?"; params.push(status); }
    const company = searchParams.get("company");
    if (company) { sql += " AND company LIKE ?"; params.push(`%${company}%`); }

    sql += " ORDER BY num DESC";

    const limit = Number(searchParams.get("limit"));
    if (limit) { sql += " LIMIT ?"; params.push(limit); }
    const offset = Number(searchParams.get("offset"));
    if (offset) { sql += " OFFSET ?"; params.push(offset); }

    const apps = db.prepare(sql).all(...params) as AppRow[];
    return NextResponse.json({ success: true, data: apps });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const body = await request.json() as AppRow;
    const db = getDb();
    db.prepare(`
      INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes, updated_at)
      VALUES (?, @num, @date, @company, @role, @score, @status, @pdf_generated, @report_path, @notes, datetime('now'))
      ON CONFLICT(company, role) DO UPDATE SET
        score=excluded.score, status=excluded.status, report_path=excluded.report_path,
        notes=excluded.notes, updated_at=datetime('now')
    `).run(user.userId, body);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
