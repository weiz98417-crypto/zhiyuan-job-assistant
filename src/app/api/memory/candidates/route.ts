import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import {
  admitMemory,
  getMemoryDiscoveryState,
  listActiveMemoryFacts,
  listMemoryCandidates,
  resolveMemoryCandidate,
} from "@/lib/memory/admission";
import { memoryContentHash } from "@/lib/memory/erasure";
import type { FactCandidate } from "@/lib/memory/fact-ledger";

function unavailable() {
  return NextResponse.json({ success: false, error: "PostgreSQL memory is not configured" }, { status: 503 });
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Not authenticated" || message === "Invalid or expired token" || message === "Token has been revoked") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (message === "memory candidate not found") {
    return NextResponse.json({ success: false, error: message }, { status: 404 });
  }
  if (message === "memory candidate expired" || message === "memory source is suppressed") {
    return NextResponse.json({ success: false, error: message }, { status: 409 });
  }
  if (message === "job-seeking use confirmation required") {
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
  console.error("[memory/candidates] failed:", message);
  return NextResponse.json({ success: false, error: "Memory operation failed" }, { status: 500 });
}

function parseFact(value: unknown): FactCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.subject !== "string" || typeof raw.predicate !== "string"
    || typeof raw.canonicalText !== "string" || !raw.canonicalText.trim()
    || !raw.object || typeof raw.object !== "object" || Array.isArray(raw.object)) return null;
  return {
    partition: "core",
    subject: raw.subject.trim(),
    predicate: raw.predicate.trim(),
    object: raw.object as Record<string, unknown>,
    canonicalText: raw.canonicalText.trim(),
    confidence: 1,
    importance: 0.7,
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return unavailable();
    const [candidates, facts, discovery] = await Promise.all([
      listMemoryCandidates(user.userId),
      listActiveMemoryFacts(user.userId),
      getMemoryDiscoveryState(user.userId),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        candidates: candidates.map((candidate) => ({ ...candidate, canonicalText: candidate.fact.canonicalText })),
        facts,
        discovery,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return unavailable();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "remember" && body.action !== "current_preference") {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }
    const fact = parseFact(body.fact);
    const sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() : "";
    if (!fact || !sourceText || sourceText.length > 4_000 || fact.canonicalText.length > 1_000) {
      return NextResponse.json({ success: false, error: "fact and sourceText are required" }, { status: 400 });
    }
    const result = await admitMemory({
      userId: user.userId,
      agentId: "profile",
      kind: body.action === "remember" ? "remember_request" : "current_preference",
      sourceType: "user_explicit_memory",
      sourceId: memoryContentHash(`${fact.canonicalText}\u0000${sourceText}`).slice(0, 64),
      fact,
      evidence: {
        quote: sourceText,
        directCurrentIntent: body.action === "current_preference",
        confirmedJobUse: body.confirmedJobUse === true,
      },
    });
    if (result.outcome === "rejected" || result.outcome === "clarify") {
      return NextResponse.json({ success: false, error: result.reason, data: result }, {
        status: result.outcome === "clarify" ? 400 : 422,
      });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return unavailable();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0 || (body.action !== "confirm" && body.action !== "reject")) {
      return NextResponse.json({ success: false, error: "Invalid candidate action" }, { status: 400 });
    }
    const result = await resolveMemoryCandidate(user.userId, id, body.action, {
      confirmedJobUse: body.confirmedJobUse === true,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
