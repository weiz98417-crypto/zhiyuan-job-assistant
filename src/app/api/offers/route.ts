import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { offerReadBackMatches } from "@/lib/offer-persistence-verifier";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await getDataRepositories().offers.list(user.userId);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const { company, role } = body;

    if (!company || !role) {
      return NextResponse.json({ success: false, error: "company and role are required" }, { status: 400 });
    }

    const repos = getDataRepositories();
    const data = await repos.offers.upsert(body, user.userId);
    const readBack = await repos.offers.get(data.id, user.userId);
    const readBackVerified = offerReadBackMatches(readBack, body, data.id);
    if (!readBackVerified) {
      return NextResponse.json({
        success: false,
        error: "Offer 持久化后回读校验失败，已阻止成功提示",
        data: { id: data.id, readBackVerified: false },
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { ...data, readBackVerified } }, { status: data.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
