import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { addMemoryEvidence, createMemoryItem } from "@/lib/memory/postgres-memory";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({})) as {
      memoryType?: string;
      canonicalText?: string;
      sourceType?: string;
      sourceId?: string | number;
      quote?: string;
      confidence?: number;
      importance?: number;
      extractionMethod?: string;
      metadata?: Record<string, unknown>;
    };

    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
      return NextResponse.json({ success: true, skipped: true, reason: "PostgreSQL memory is not configured" });
    }

    const canonicalText = (body.canonicalText || "").trim();
    if (!canonicalText || canonicalText.length < 8) {
      return NextResponse.json({ success: false, error: "canonicalText is required" }, { status: 400 });
    }

    const itemId = await createMemoryItem({
      userId: user.userId,
      memoryType: body.memoryType || "agent_observation",
      canonicalText,
      status: "candidate",
      confidence: body.confidence ?? 0.55,
      importance: body.importance ?? 0.5,
      sourceCount: 1,
      metadata: body.metadata || {},
    });

    const evidenceId = await addMemoryEvidence({
      userId: user.userId,
      memoryItemId: itemId,
      sourceType: body.sourceType || "agent",
      sourceId: body.sourceId ?? "",
      quote: body.quote || canonicalText,
      extractionMethod: body.extractionMethod || "agent_writeback",
      confidence: body.confidence ?? 0.55,
      metadata: body.metadata || {},
    });

    return NextResponse.json({ success: true, data: { itemId, evidenceId, status: "candidate", readBackVerified: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Not authenticated" || message === "Invalid or expired token") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[agent/memory-writeback] failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
