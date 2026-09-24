import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { getMemoryDiscoveryState, setMemoryDiscoveryState } from "@/lib/memory/admission";

export async function GET() {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
      return NextResponse.json({ success: false, error: "PostgreSQL memory is not configured" }, { status: 503 });
    }
    return NextResponse.json({ success: true, data: await getMemoryDiscoveryState(user.userId) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
      return NextResponse.json({ success: false, error: "PostgreSQL memory is not configured" }, { status: 503 });
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.enabled !== "boolean" && body.acknowledgeNotice !== true) {
      return NextResponse.json({ success: false, error: "enabled or acknowledgeNotice is required" }, { status: 400 });
    }
    const data = await setMemoryDiscoveryState(user.userId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      acknowledgeNotice: body.acknowledgeNotice === true,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Not authenticated" || message === "Invalid or expired token" || message === "Token has been revoked") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  console.error("[memory/discovery] failed:", message);
  return NextResponse.json({ success: false, error: "Memory discovery update failed" }, { status: 500 });
}
