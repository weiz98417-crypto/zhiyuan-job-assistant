import { NextResponse } from "next/server";
import { getCurrentUser } from '@/lib/auth';
import { type AppRow } from "@/lib/server-db";
import { getDataRepositories } from "@/lib/data-repositories";

export async function GET(request: Request) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const company = searchParams.get("company");
    const limit = Number(searchParams.get("limit"));
    const offset = Number(searchParams.get("offset"));

    const apps = await getDataRepositories().applications.list({ status: status || undefined, company: company || undefined, limit, offset }, user.userId);
    return NextResponse.json({ success: true, data: apps });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }

    const body = await request.json() as AppRow;
    await getDataRepositories().applications.upsert(body, user.userId);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
