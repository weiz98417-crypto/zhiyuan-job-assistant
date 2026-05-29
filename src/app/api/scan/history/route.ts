import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/server-db";
import { getScanHistory } from "../../../../../lib/scan/orchestrator.mjs";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "10");

    const db = getDb();
    const result = getScanHistory(db, String(user.userId), { page, limit });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("GET /api/scan/history error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
