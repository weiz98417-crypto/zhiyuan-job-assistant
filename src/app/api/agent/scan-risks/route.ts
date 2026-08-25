import { NextResponse } from "next/server";
import { scanJDRisks } from "@/lib/server/jd-risk-service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { jd_text?: string };
  if (!body.jd_text || typeof body.jd_text !== "string") {
    return NextResponse.json({ success: false, error: "缺少 jd_text" }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: scanJDRisks(body.jd_text) });
}
