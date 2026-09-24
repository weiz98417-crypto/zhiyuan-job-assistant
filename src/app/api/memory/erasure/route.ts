import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/security/auth-guards";
import {
  cancelMemoryErasure,
  confirmMemoryErasure,
  getMemoryErasureRequest,
  prepareMemoryErasure,
  type MemoryErasureTargetType,
} from "@/lib/memory/erasure";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticated();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const targetType = normalizeTargetType(body.targetType);
    const targetId = Number(body.targetId);
    if (!targetType || !Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json({ success: false, error: "targetType and targetId are required" }, { status: 400 });
    }
    const prepared = await prepareMemoryErasure(user.userId, targetType, targetId);
    return NextResponse.json({ success: true, data: prepared });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticated();
    const requestId = Number(new URL(request.url).searchParams.get("requestId"));
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return NextResponse.json({ success: false, error: "requestId is required" }, { status: 400 });
    }
    const data = await getMemoryErasureRequest(user.userId, requestId);
    if (!data) return NextResponse.json({ success: false, error: "Erasure request not found" }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticated();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requestId = Number(body.requestId);
    const action = String(body.action || "");
    if (!Number.isInteger(requestId) || requestId <= 0 || !["confirm", "cancel"].includes(action)) {
      return NextResponse.json({ success: false, error: "requestId and action are required" }, { status: 400 });
    }
    if (action === "cancel") {
      const cancelled = await cancelMemoryErasure(user.userId, requestId);
      return NextResponse.json({ success: cancelled, data: { requestId, status: cancelled ? "cancelled" : "unchanged" } }, { status: cancelled ? 200 : 409 });
    }
    const data = await confirmMemoryErasure(user.userId, requestId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}

function normalizeTargetType(value: unknown): MemoryErasureTargetType | null {
  return value === "fact" || value === "legacy_item" ? value : null;
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Not authenticated" || message === "Invalid or expired token" || message === "Token has been revoked") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (message === "Memory not found" || message === "Memory erasure request not found") {
    return NextResponse.json({ success: false, error: message }, { status: 404 });
  }
  console.error("[memory/erasure] failed", error);
  return NextResponse.json({ success: false, error: message }, { status: 409 });
}
