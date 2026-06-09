import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getScanJobsForUser } from "@/lib/scan-data";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "new";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");

    const result = await getScanJobsForUser(String(user.userId), { status, page, limit });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("GET /api/scan/jobs error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
