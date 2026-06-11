import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { indexMemorySourceBestEffort } from "@/lib/memory/postgres-memory";
import { MEMORY_SOURCE_TYPES, type MemorySourceType } from "@/lib/memory/vector-memory";

const SOURCE_TYPES = new Set<string>(MEMORY_SOURCE_TYPES);

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({})) as {
      sourceType?: string;
      sourceId?: string | number;
      text?: string;
      title?: string;
      metadata?: Record<string, unknown>;
    };

    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
      return NextResponse.json({ success: true, skipped: true, reason: "PostgreSQL memory is not configured" });
    }

    if (!body.sourceType || !SOURCE_TYPES.has(body.sourceType)) {
      return NextResponse.json({ success: false, error: "Invalid sourceType" }, { status: 400 });
    }
    if (body.sourceId === undefined || body.sourceId === null || !String(body.sourceId).trim()) {
      return NextResponse.json({ success: false, error: "sourceId is required" }, { status: 400 });
    }
    if (!body.text || body.text.trim().length < 20) {
      return NextResponse.json({ success: false, error: "text must be at least 20 chars" }, { status: 400 });
    }

    const chunks = await indexMemorySourceBestEffort({
      userId: user.userId,
      sourceType: body.sourceType as MemorySourceType,
      sourceId: body.sourceId,
      text: body.text,
      title: body.title || "",
      metadata: body.metadata || {},
    });

    const embedded = chunks.filter((chunk) => chunk.embeddingStatus === "embedded").length;
    const failed = chunks.filter((chunk) => chunk.embeddingStatus === "failed").length;
    return NextResponse.json({ success: true, data: { chunks: chunks.length, embedded, failed, readBackVerified: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Not authenticated" || message === "Invalid or expired token") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[agent/memory-index] failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
