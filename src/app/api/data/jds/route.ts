import { NextResponse } from "next/server";
import { type JDRow } from "@/lib/server-db";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";

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

function jdReadBackMatches(row: JDRow | undefined, expected: JDRow): boolean {
  if (!row) return false;
  const normalizeKeywords = (value?: string) => {
    try { return JSON.stringify(JSON.parse(value || "[]")); } catch { return value || "[]"; }
  };
  return (
    row.company === expected.company &&
    row.role === expected.role &&
    row.source_type === expected.source_type &&
    (row.source_url || "") === (expected.source_url || "") &&
    row.body === expected.body &&
    normalizeKeywords(row.keywords_json) === normalizeKeywords(expected.keywords_json) &&
    Number(row.report_id || 0) === Number(expected.report_id || 0)
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await getCurrentUser();
    const service = getAgentReadService();
    const id = Number(searchParams.get("id"));
    if (Number.isFinite(id) && id > 0) {
      const jd = await service.getJd({ userId: user.userId }, id);
      if (!jd) return NextResponse.json({ success: false, error: "JD not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: jd });
    }
    const data = await service.listJds({ userId: user.userId });
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
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const reusable = await repos.jds.findReusable({ source_url: row.source_url, body: row.body }, user.userId);
    if (reusable?.id) {
      return NextResponse.json({ success: true, id: reusable.id, reused: true, data: toClientJD(reusable), jdReadBackVerified: true });
    }
    const id = await repos.jds.insert(row, user.userId);
    const readBack = await repos.jds.get(id, user.userId);
    const jdReadBackVerified = jdReadBackMatches(readBack, row);
    return NextResponse.json({
      success: jdReadBackVerified,
      id,
      reused: false,
      data: readBack ? toClientJD(readBack) : undefined,
      jdReadBackVerified,
      error: jdReadBackVerified ? undefined : "JD read-back verification failed",
    }, { status: jdReadBackVerified ? 200 : 500 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Partial<JDRow> & {
      id?: number;
      sourceType?: string;
      sourceUrl?: string;
      keywords?: string[];
      reportId?: number;
    };
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "JD 编号无效" }, { status: 400 });
    }
    const user = await getCurrentUser();
    const updates = {
      company: body.company,
      role: body.role,
      source_type: body.source_type || body.sourceType,
      source_url: body.source_url || body.sourceUrl,
      body: body.body,
      keywords_json: body.keywords_json || (body.keywords ? JSON.stringify(body.keywords) : undefined),
      report_id: body.report_id || body.reportId,
    };
    const updated = await getDataRepositories().jds.update(id, updates, user.userId);
    if (!updated) return NextResponse.json({ success: false, error: "JD not found" }, { status: 404 });
    const readBack = await getDataRepositories().jds.get(id, user.userId);
    const expected = { ...updated, ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)) } as JDRow;
    const jdReadBackVerified = jdReadBackMatches(readBack, expected);
    return NextResponse.json({
      success: jdReadBackVerified,
      data: readBack ? toClientJD(readBack) : toClientJD(updated),
      jdReadBackVerified,
      error: jdReadBackVerified ? undefined : "JD update read-back verification failed",
    }, { status: jdReadBackVerified ? 200 : 500 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `更新失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "JD 编号无效" }, { status: 400 });
    }
    const user = await getCurrentUser();
    const deleted = await getDataRepositories().jds.delete(id, user.userId);
    return NextResponse.json({ success: true, deleted });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `删除失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
