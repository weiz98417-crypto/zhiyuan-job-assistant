import { NextRequest, NextResponse } from "next/server";
import { cancelScanForUser, getActiveScanForUser, getScanStatusForUser } from "@/lib/scan-data";
import { getCurrentScanUserId, isScanAuthError } from "@/lib/scan-auth";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentScanUserId();

    const url = new URL(request.url);
    const scanId = url.searchParams.get("scanId");
    const active = url.searchParams.get("active");

    if (active === "true") {
      const scan = await getActiveScanForUser(userId);
      return NextResponse.json({ success: true, data: scan });
    }

    if (!scanId) return NextResponse.json({ error: "Missing scanId or active=true param" }, { status: 400 });

    const status = await getScanStatusForUser(scanId, userId);
    if (!status) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: status });
  } catch (error: unknown) {
    if (isScanAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("GET /api/scan/status error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getCurrentScanUserId();

    const body = await request.json();
    const scanId = body?.scanId;
    const action = body?.action;
    if (action !== "cancel") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    const result = await cancelScanForUser(scanId || null, userId);
    if (!result.success) return NextResponse.json({ success: true, alreadyFinished: true });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (isScanAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("PATCH /api/scan/status error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
