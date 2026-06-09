import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

export async function GET(_request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const user = await getCurrentUser();
    const report = await getDataRepositories().reports.get(parseInt(reportNum), user.userId);
    if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });
    return NextResponse.json({ success: true, data: report });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const user = await getCurrentUser();
    const num = parseInt(reportNum);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ success: false, error: "报告编号无效" }, { status: 400 });
    }
    const report = await getDataRepositories().reports.get(num, user.userId);
    if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });

    const body = await request.json() as {
      company?: string;
      role?: string;
      archetype?: string;
      legitimacy?: string;
      keywords?: string[];
    };

    const hasUpdate =
      typeof body.company === "string" ||
      typeof body.role === "string" ||
      typeof body.archetype === "string" ||
      typeof body.legitimacy === "string" ||
      Array.isArray(body.keywords);

    if (!hasUpdate) {
      return NextResponse.json({ success: false, error: "没有可更新的报告字段" }, { status: 400 });
    }

    const next = {
      company: typeof body.company === "string" && body.company.trim() ? body.company.trim() : report.company,
      role: typeof body.role === "string" && body.role.trim() ? body.role.trim() : report.role,
      archetype: typeof body.archetype === "string" ? body.archetype.trim() : report.archetype,
      legitimacy: typeof body.legitimacy === "string" ? body.legitimacy.trim() : report.legitimacy,
      keywords_json: Array.isArray(body.keywords) ? JSON.stringify(body.keywords) : report.keywords_json,
    };

    const updated = await getDataRepositories().reports.updateMetadata(num, next, user.userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `更新失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const user = await getCurrentUser();
    const num = parseInt(reportNum);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ success: false, error: "报告编号无效" }, { status: 400 });
    }

    const report = await getDataRepositories().reports.get(num, user.userId);
    if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });

    await getDataRepositories().reports.delete(num, user.userId);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `删除失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
