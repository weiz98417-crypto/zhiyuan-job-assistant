import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const row = await getDataRepositories().sessions.get(Number(id), user.userId);
    if (!row) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const ok = await getDataRepositories().sessions.update(Number(id), user.userId, body);
    if (!ok) return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
