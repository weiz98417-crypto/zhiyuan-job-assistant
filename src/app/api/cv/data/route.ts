import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const row = await getDataRepositories().cv.get(user.userId);
    if (!row) return NextResponse.json({ success: true, data: {} });
    return NextResponse.json({ success: true, data: JSON.parse(row.data_json) });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    await getDataRepositories().cv.upsert(user.userId, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
