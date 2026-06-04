import { NextResponse } from "next/server";
import { type JDRow } from "@/lib/server-db";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

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
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const id = Number(searchParams.get("id"));
    if (Number.isFinite(id) && id > 0) {
      const jd = await repos.jds.get(id, user.userId);
      if (!jd) return NextResponse.json({ success: false, error: "JD not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: toClientJD(jd) });
    }
    const data = (await repos.jds.list(user.userId)).map(toClientJD);
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
      return NextResponse.json({ success: true, id: reusable.id, reused: true, data: toClientJD(reusable) });
    }
    const id = await repos.jds.insert(row, user.userId);
    return NextResponse.json({ success: true, id, reused: false });
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
      return NextResponse.json({ success: false, error: "JD 缂栧彿鏃犳晥" }, { status: 400 });
    }
    const user = await getCurrentUser();
    const updated = await getDataRepositories().jds.update(id, {
      company: body.company,
      role: body.role,
      source_type: body.source_type || body.sourceType,
      source_url: body.source_url || body.sourceUrl,
      body: body.body,
      keywords_json: body.keywords_json || (body.keywords ? JSON.stringify(body.keywords) : undefined),
      report_id: body.report_id || body.reportId,
    }, user.userId);
    if (!updated) return NextResponse.json({ success: false, error: "JD not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: toClientJD(updated) });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `鏇存柊澶辫触: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
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
