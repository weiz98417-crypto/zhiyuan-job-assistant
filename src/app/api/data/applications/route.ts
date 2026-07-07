import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { getApplicationContext, trackApplication, updateApplicationStatus } from "@/lib/application-workflow";

function positiveNumber(value: string | null): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function nonNegativeNumber(value: string | null): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function GET(request: Request) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const company = searchParams.get("company") || undefined;
    const role = searchParams.get("role") || undefined;
    const id = positiveNumber(searchParams.get("id"));
    const reportNum = positiveNumber(searchParams.get("reportNum") || searchParams.get("report_num"));
    const jdId = positiveNumber(searchParams.get("jdId") || searchParams.get("jd_id"));
    const scoreMin = nonNegativeNumber(searchParams.get("score_min"));
    const dateFrom = searchParams.get("date_from") || undefined;
    const limit = positiveNumber(searchParams.get("limit"));
    const offset = nonNegativeNumber(searchParams.get("offset"));

    if (searchParams.get("context") === "1") {
      const context = await getApplicationContext({ id, reportNum, jdId, company, role }, user.userId);
      return NextResponse.json({ success: true, data: context });
    }

    const apps = await getDataRepositories().applications.list({
      id,
      reportNum,
      jdId,
      status,
      company,
      role,
      score_min: scoreMin,
      date_from: dateFrom,
      limit,
      offset,
    }, user.userId);
    return NextResponse.json({ success: true, data: apps });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = await trackApplication({
      company: body.company,
      role: body.role,
      score: body.score,
      status: body.status,
      date: body.date,
      notes: body.notes,
      reportNum: body.reportNum ?? body.report_num ?? body.num,
      jdId: body.jdId ?? body.jd_id,
      sourceUrl: body.sourceUrl ?? body.source_url,
      source: body.source,
      metadata: body.metadata,
    }, user.userId);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = await updateApplicationStatus({
      id: body.id,
      company: body.company,
      role: body.role,
      reportNum: body.reportNum ?? body.report_num,
      jdId: body.jdId ?? body.jd_id,
      status: body.status,
      note: body.note ?? body.notes,
      source: body.source,
      metadata: body.metadata,
    }, user.userId);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `更新失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
