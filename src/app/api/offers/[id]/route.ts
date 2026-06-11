import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { offerReadBackMatches } from "@/lib/offer-persistence-verifier";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const offerId = Number(id);
    if (!Number.isFinite(offerId)) {
      return NextResponse.json({ success: false, error: "invalid offer id" }, { status: 400 });
    }

    const row = await getDataRepositories().offers.get(offerId, user.userId);
    if (!row) return NextResponse.json({ success: false, error: "offer not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const offerId = Number(id);
    if (!Number.isFinite(offerId)) {
      return NextResponse.json({ success: false, error: "invalid offer id" }, { status: 400 });
    }

    const body = await request.json();
    if (!body.company || !body.role) {
      return NextResponse.json({ success: false, error: "company and role are required" }, { status: 400 });
    }

    const row = await getDataRepositories().offers.update(offerId, body, user.userId);
    if (!row) return NextResponse.json({ success: false, error: "offer not found" }, { status: 404 });
    const readBackVerified = offerReadBackMatches(row, body, offerId);
    if (!readBackVerified) {
      return NextResponse.json({
        success: false,
        error: "Offer 更新后回读校验失败，已阻止成功提示",
        data: { id: offerId, readBackVerified: false },
      }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { ...row, readBackVerified } });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const offerId = Number(id);
    if (!Number.isFinite(offerId)) {
      return NextResponse.json({ success: false, error: "invalid offer id" }, { status: 400 });
    }

    const result = await getDataRepositories().offers.delete(offerId, user.userId);
    if (!result) return NextResponse.json({ success: false, error: "offer not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
