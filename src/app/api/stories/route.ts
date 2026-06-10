import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await getDataRepositories().stories.list(user.userId);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const { title, situation, task, action, result, tags } = await request.json();
    const id = await getDataRepositories().stories.create({ title, situation, task, action, result, tags }, user.userId);
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
