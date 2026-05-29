import { NextResponse } from "next/server";
import { getDb } from "@/lib/server-db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const offerId = Number(id);
    if (!Number.isFinite(offerId)) {
      return NextResponse.json({ success: false, error: "invalid offer id" }, { status: 400 });
    }

    const row = getDb().prepare("SELECT * FROM offers WHERE id = ?").get(offerId);
    if (!row) {
      return NextResponse.json({ success: false, error: "offer not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const offerId = Number(id);
    if (!Number.isFinite(offerId)) {
      return NextResponse.json({ success: false, error: "invalid offer id" }, { status: 400 });
    }

    const db = getDb();
    const offer = db.prepare("SELECT id FROM offers WHERE id = ?").get(offerId) as { id: number } | undefined;
    if (!offer) {
      return NextResponse.json({ success: false, error: "offer not found" }, { status: 404 });
    }

    const reportRows = db.prepare("SELECT id, offer_id, report_type, offer_snapshot_json FROM offer_reports").all() as {
      id: number;
      offer_id?: number | null;
      report_type?: string;
      offer_snapshot_json?: string;
    }[];
    const reportIds = reportRows
      .filter((row) => {
        if (Number(row.offer_id || 0) === offerId) return true;
        if (row.report_type !== "single") return false;
        try {
          const snapshot = JSON.parse(row.offer_snapshot_json || "{}") as Record<string, unknown>;
          return Number(snapshot.offerId || 0) === offerId;
        } catch {
          return false;
        }
      })
      .map((row) => row.id);

    const tx = db.transaction(() => {
      if (reportIds.length) {
        const stmt = db.prepare(`DELETE FROM offer_reports WHERE id IN (${reportIds.map(() => "?").join(",")})`);
        stmt.run(...reportIds);
      }
      db.prepare("DELETE FROM offers WHERE id = ?").run(offerId);
    });
    tx();

    return NextResponse.json({ success: true, data: { offerId, deletedReports: reportIds.length } });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
