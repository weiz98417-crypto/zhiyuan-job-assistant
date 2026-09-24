import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/security/auth-guards";
import {
  createMemorySupportGrant,
  listMemorySupportGrants,
  revokeMemorySupportGrant,
} from "@/lib/memory/support-access";

export async function GET() {
  try {
    const user = await requireAuthenticated();
    return NextResponse.json({ success: true, data: await listMemorySupportGrants(user.userId) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticated();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const supportUserId = typeof body.supportUserId === "string" ? body.supportUserId.trim() : "";
    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : "";
    if (!supportUserId || !scopes.length || !expiresAt) {
      return NextResponse.json({ success: false, error: "supportUserId, scopes and expiresAt are required" }, { status: 400 });
    }
    const grant = await createMemorySupportGrant({
      userId: user.userId,
      supportUserId,
      scopes,
      reason: typeof body.reason === "string" ? body.reason : "",
      expiresAt,
    });
    return NextResponse.json({ success: true, data: grant }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticated();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const grantId = Number(body.grantId);
    if (!Number.isSafeInteger(grantId) || grantId <= 0) {
      return NextResponse.json({ success: false, error: "grantId is required" }, { status: 400 });
    }
    const revoked = await revokeMemorySupportGrant(user.userId, grantId);
    return NextResponse.json({ success: revoked, data: { grantId, status: revoked ? "revoked" : "unchanged" } }, { status: revoked ? 200 : 404 });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Forbidden") return NextResponse.json({ success: false, error: message }, { status: 403 });
  if (message.includes("authenticated") || message.includes("token")) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (message.includes("Support grant") || message.includes("support scope") || message.includes("support identity")) {
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
  console.error("[memory/support-access] failed:", error);
  return NextResponse.json({ success: false, error: "Support access operation failed" }, { status: 500 });
}
