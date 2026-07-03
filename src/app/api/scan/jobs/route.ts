import { NextRequest, NextResponse } from "next/server";
import { getScanJobsForRun, getScanJobsForUser } from "@/lib/scan-data";
import { getCurrentScanUserId, isScanAuthError } from "@/lib/scan-auth";

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentScanUserId();

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status = statusParam === "all" ? undefined : statusParam || "new";
    const scanId = url.searchParams.get("scanId") || "";
    const after = url.searchParams.get("after") || undefined;
    const since = url.searchParams.get("since") || undefined;
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const limit = parsePositiveInt(url.searchParams.get("limit"), 20);
    const result = scanId
      ? await getScanJobsForRun(userId, scanId, { status, page, limit, after, since })
      : await getScanJobsForUser(userId, { status, page, limit, after, since });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (isScanAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("GET /api/scan/jobs error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
