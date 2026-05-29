import { NextResponse } from "next/server";
import { getDb } from "@/lib/server-db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId)) {
      return NextResponse.json({ success: false, error: "invalid report id" }, { status: 400 });
    }

    const row = getDb().prepare("SELECT * FROM offer_reports WHERE id = ?").get(reportId);
    if (!row) {
      return NextResponse.json({ success: false, error: "offer report not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId)) {
      return NextResponse.json({ success: false, error: "invalid report id" }, { status: 400 });
    }

    const db = getDb();
    const report = db.prepare("SELECT id, offer_id FROM offer_reports WHERE id = ?").get(reportId) as { id: number; offer_id?: number | null } | undefined;
    if (!report) {
      return NextResponse.json({ success: false, error: "offer report not found" }, { status: 404 });
    }

    const tx = db.transaction(() => {
      db.prepare("UPDATE offers SET latest_report_id = NULL, updated_at = datetime('now') WHERE latest_report_id = ?").run(reportId);
      db.prepare("DELETE FROM offer_reports WHERE id = ?").run(reportId);
    });
    tx();

    return NextResponse.json({ success: true, data: { reportId, offerId: report.offer_id || null } });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
