import { NextRequest, NextResponse } from "next/server";
import { startJobDiscoveryRunForUser, type JobDiscoveryRunInput } from "@/lib/job-discovery-run";
import { getCurrentScanUserId, isScanAuthError } from "@/lib/scan-auth";

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentScanUserId();

    let body: JobDiscoveryRunInput = {};
    try {
      body = await request.json();
    } catch {
      // empty body
    }

    const run = await startJobDiscoveryRunForUser(userId, body);
    if (!run.success && run.error === "missing_title_keywords") {
      return NextResponse.json(
        { error: run.error, message: run.message },
        { status: 400 },
      );
    }
    if (!run.success) {
      return NextResponse.json({ error: run.error, message: run.message }, { status: 500 });
    }
    if (run.conflict) {
      return NextResponse.json(
        { error: "scan_already_running", existingScanId: run.scanId },
        { status: 409 },
      );
    }

    return NextResponse.json({ scanId: run.scanId, companiesTotal: run.companiesTotal }, { status: 201 });
  } catch (error: unknown) {
    if (isScanAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("POST /api/scan error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
