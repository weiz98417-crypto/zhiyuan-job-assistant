import { NextResponse } from "next/server";
import { getReport } from "@/lib/server-db";

export async function GET(_request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const report = getReport(parseInt(reportNum));
    if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });
    return NextResponse.json({ success: true, data: report });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
