import { NextResponse } from "next/server";
import { getDataRepositories } from "@/lib/data-repositories";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const reports = await getDataRepositories().reports.list(user.userId);
    return NextResponse.json({ success: true, data: reports });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
