import { NextResponse } from "next/server";
import { getDb, getReport } from "@/lib/server-db";

export async function GET(_request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const report = getReport(parseInt(reportNum));
    if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });
    return NextResponse.json({ success: true, data: report });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const num = parseInt(reportNum);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ success: false, error: "报告编号无效" }, { status: 400 });
    }
    const report = getReport(num);
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

    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE reports
        SET company = @company,
            role = @role,
            archetype = @archetype,
            legitimacy = @legitimacy,
            keywords_json = @keywords_json
        WHERE report_num = @report_num
      `).run({ ...next, report_num: num });

      db.prepare(`
        UPDATE applications
        SET company = @company,
            role = @role,
            updated_at = datetime('now')
        WHERE company = @oldCompany AND role = @oldRole
      `).run({
        company: next.company,
        role: next.role,
        oldCompany: report.company,
        oldRole: report.role,
      });

      db.prepare(`
        UPDATE jds
        SET company = @company,
            role = @role
        WHERE report_id = @report_num
      `).run({ company: next.company, role: next.role, report_num: num });
    });
    tx();

    return NextResponse.json({ success: true, data: getReport(num) });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `更新失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const num = parseInt(reportNum);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ success: false, error: "报告编号无效" }, { status: 400 });
    }

    const db = getDb();
    const report = getReport(num);
    if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });

    const tx = db.transaction(() => {
      db.prepare("UPDATE jds SET report_id = NULL WHERE report_id = ? OR report_id = ?").run(num, report.id || num);
      db.prepare("DELETE FROM reports WHERE report_num = ?").run(num);
    });
    tx();

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `删除失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
