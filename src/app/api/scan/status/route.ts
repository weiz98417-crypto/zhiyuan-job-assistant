import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/server-db";
import { getScanStatus, getActiveScan, cancelScan, cancelActiveScan } from "../../../../../lib/scan/orchestrator.mjs";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    const url = new URL(request.url);
    const scanId = url.searchParams.get("scanId");
    const active = url.searchParams.get("active");

    if (active === "true") {
      const scan = getActiveScan(db, String(user.userId));
      return NextResponse.json({ success: true, data: scan });
    }

    if (!scanId) {
      return NextResponse.json({ error: "Missing scanId or active=true param" }, { status: 400 });
    }

    const status = getScanStatus(db, scanId, String(user.userId));
    if (!status) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: status });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("GET /api/scan/status error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const scanId = body?.scanId;
    const action = body?.action;
    if (action !== "cancel") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const db = getDb();
    const result = scanId
      ? cancelScan(db, scanId, String(user.userId))
      : cancelActiveScan(db, String(user.userId));
    if (!result.success) {
      return NextResponse.json({ success: true, alreadyFinished: true });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("PATCH /api/scan/status error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
