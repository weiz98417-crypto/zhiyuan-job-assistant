import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { admitMemory } from "@/lib/memory/admission";

const PENDING_CANDIDATE_RESPONSE = { status: "candidate" as const, readBackVerified: true as const };

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
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
    const sourceId = String(body.sourceId ?? "").trim();
    if (!sourceId) {
      return NextResponse.json({ success: false, error: "sourceId is required" }, { status: 400 });
    }

    const result = await admitMemory({
      userId: user.userId,
      agentId: "profile",
      kind: "session_observation",
      sourceType: body.sourceType || "agent",
      sourceId,
      fact: {
        partition: "core",
        subject: `${body.sourceType || "agent"}:${sourceId}`,
        predicate: body.memoryType || "agent_observation",
        object: { observation: canonicalText },
        canonicalText,
        confidence: body.confidence ?? 0.55,
        importance: body.importance ?? 0.5,
      },
      evidence: {
        quote: body.quote || canonicalText,
        extractionMethod: body.extractionMethod || "agent_writeback",
        metadata: body.metadata || {},
      },
    });
    const statusResponse = result.outcome === "candidate"
      ? PENDING_CANDIDATE_RESPONSE
      : { status: result.outcome, readBackVerified: false as const };
    if (result.outcome === "rejected" || result.outcome === "clarify" || result.outcome === "behavior_signal") {
      return NextResponse.json({
        success: false,
        error: result.reason,
        data: { ...statusResponse, admissionReason: result.reason, readBackVerified: false },
      }, { status: result.outcome === "clarify" ? 400 : 422 });
    }
    return NextResponse.json({
      success: true,
      data: {
        itemId: result.candidate?.id,
        ...statusResponse,
        admissionReason: result.reason,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Not authenticated" || message === "Invalid or expired token" || message === "Token has been revoked") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[agent/memory-writeback] failed:", message);
    return NextResponse.json({ success: false, error: "Memory admission failed" }, { status: 500 });
  }
}
