import { NextResponse } from "next/server";
import { listJDs, insertJD, type JDRow } from "@/lib/server-db";

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: listJDs() });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as JDRow;
    insertJD(body);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
