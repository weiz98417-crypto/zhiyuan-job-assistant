import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { correctMemoryFact } from "@/lib/memory/correction";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
      return NextResponse.json({ success: false, error: "PostgreSQL memory is not configured" }, { status: 503 });
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const targetFactId = Number(body.targetFactId);
    const canonicalText = typeof body.canonicalText === "string" ? body.canonicalText.trim() : "";
    const sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() : "";
    const object = body.object && typeof body.object === "object" && !Array.isArray(body.object)
      ? body.object as Record<string, unknown>
      : undefined;
    if (!Number.isSafeInteger(targetFactId) || targetFactId <= 0 || !canonicalText || canonicalText.length > 1_000 || !sourceText || sourceText.length > 4_000) {
      return NextResponse.json({ success: false, error: "targetFactId, canonicalText and sourceText are required" }, { status: 400 });
    }
    const recorded = await correctMemoryFact({ userId: user.userId }, { targetFactId, canonicalText, object, sourceText });
    return NextResponse.json({ success: true, data: { recorded } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (["Not authenticated", "Invalid or expired token", "Token has been revoked"].includes(message)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Memory fact not found or already inactive") {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    if (message === "forbidden_secret_or_identity_number") {
      return NextResponse.json({ success: false, error: message }, { status: 422 });
    }
    console.error("[memory/correction] failed:", message);
    return NextResponse.json({ success: false, error: "Memory correction failed" }, { status: 500 });
  }
}
