import { NextResponse } from "next/server";
import { listReports } from "@/lib/server-db";

export async function GET() {
  try {
    const reports = listReports();
    return NextResponse.json({ success: true, data: reports });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
