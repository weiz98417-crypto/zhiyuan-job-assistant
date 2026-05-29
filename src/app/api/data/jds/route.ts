import { NextResponse } from "next/server";
import { findReusableJD, getJD, getDb, listJDs, insertJD, type JDRow } from "@/lib/server-db";

function toClientJD(jd: JDRow) {
  return {
    id: jd.id,
    company: jd.company,
    role: jd.role,
    sourceType: jd.source_type,
    sourceUrl: jd.source_url || undefined,
    body: jd.body,
    keywords: (() => {
      try { return JSON.parse(jd.keywords_json || "[]"); } catch { return []; }
    })(),
    reportId: jd.report_id,
    createdAt: jd.created_at || new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (Number.isFinite(id) && id > 0) {
      const jd = getJD(id);
      if (!jd) return NextResponse.json({ success: false, error: "JD not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: toClientJD(jd) });
    }
    const data = listJDs().map(toClientJD);
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<JDRow> & {
      sourceType?: string;
      sourceUrl?: string;
      keywords?: string[];
      reportId?: number;
    };
    const row: JDRow = {
      company: body.company || "",
      role: body.role || "",
      source_type: body.source_type || body.sourceType || "paste",
      source_url: body.source_url || body.sourceUrl || "",
      body: body.body || "",
      keywords_json: body.keywords_json || JSON.stringify(body.keywords || []),
      report_id: body.report_id || body.reportId,
    };
    const reusable = findReusableJD({ source_url: row.source_url, body: row.body });
    if (reusable?.id) {
      return NextResponse.json({ success: true, id: reusable.id, reused: true, data: toClientJD(reusable) });
    }
    const id = insertJD(row);
    return NextResponse.json({ success: true, id, reused: false });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "JD 编号无效" }, { status: 400 });
    }
    const db = getDb();
    db.prepare("UPDATE scan_jobs SET jd_id = NULL, status = CASE WHEN status IN ('saved','evaluating') THEN 'viewed' ELSE status END WHERE jd_id = ?").run(id);
    const result = db.prepare("DELETE FROM jds WHERE id = ?").run(id);
    return NextResponse.json({ success: true, deleted: result.changes });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `删除失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
