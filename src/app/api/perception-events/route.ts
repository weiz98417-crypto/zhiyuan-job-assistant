import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { isPerceptionMetric, recordPerceptionEvent } from "@/lib/server/perception-events";

/** Spec 30 / WP5（M1）：感知事件唯一客户端写通道——鉴权 + metric 白名单 + payload ≤1KB。 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
      return NextResponse.json({ success: false, error: "unavailable" }, { status: 503 });
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const metric = typeof body.metric === "string" ? body.metric : "";
    if (!isPerceptionMetric(metric)) {
      return NextResponse.json({ success: false, error: "unknown metric" }, { status: 400 });
    }
    const payload = (body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload : {}) as Record<string, unknown>;
    if (JSON.stringify(payload).length > 1_024) {
      return NextResponse.json({ success: false, error: "payload too large" }, { status: 413 });
    }
    const ok = await recordPerceptionEvent(user.userId, metric, payload);
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
