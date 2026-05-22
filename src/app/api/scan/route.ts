import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/server-db";
import { loadPortals, createScanEntry } from "../../../../lib/scan/orchestrator.mjs";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let companyFilter: string[] | undefined;
    try {
      const body = await request.json();
      if (body?.companies && Array.isArray(body.companies)) {
        companyFilter = body.companies;
      }
    } catch {
      // empty body → full scan
    }

    const companies = await loadPortals();
    const db = getDb();
    const { scanId, conflict } = createScanEntry(db, String(user.userId), companies, companyFilter);

    if (conflict) {
      return NextResponse.json(
        { error: "scan_already_running", existingScanId: scanId },
        { status: 409 }
      );
    }

    return NextResponse.json({ scanId }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("POST /api/scan error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
