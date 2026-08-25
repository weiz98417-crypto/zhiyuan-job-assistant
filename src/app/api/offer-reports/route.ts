import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  OfferAgentInputError,
  saveOfferReportForUser,
} from "@/lib/server/offer-agent-service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as Record<string, unknown>;
    const data = await saveOfferReportForUser({ userId: user.userId }, body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/auth|登录|token/i.test(message)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const status = error instanceof OfferAgentInputError ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await getDataRepositories().offerReports.list(user.userId);
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/auth|登录|token/i.test(message)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
