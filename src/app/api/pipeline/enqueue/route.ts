import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/server-db";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { url, company, title, jd_snippet } = body || {};

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Validate URL format
    try { new URL(url); } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const db = getDb();
    const userId = String(user.userId);

    // Mark the job as evaluated if it was from a scan (existing scan_jobs row)
    const updated = db.prepare(`
      UPDATE scan_jobs SET status = 'evaluated', last_interaction_at = datetime('now')
      WHERE url = ? AND user_id = ?
    `).run(url, userId);

    // If not from a scan, insert a new row with NULL scan_id
    if (updated.changes === 0) {
      const dedupKey = createHash('sha256').update(url).digest('hex');
      db.prepare(`
        INSERT OR IGNORE INTO scan_jobs (scan_id, user_id, company, title, url, jd_snippet, status, dedup_key)
        VALUES (NULL, ?, ?, ?, ?, ?, 'evaluated', ?)
      `).run(userId, company || '未知', title || '未知职位', url, jd_snippet || '', dedupKey);
    }

    return NextResponse.json({
      success: true,
      data: { url, company, title, status: "enqueued" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("POST /api/pipeline/enqueue error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
