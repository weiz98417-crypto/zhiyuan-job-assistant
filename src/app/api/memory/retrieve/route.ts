import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { retrieveMemorySnippets } from "@/lib/memory/postgres-memory";
import { normalizeMemorySourceFilters, type MemorySourceFilter } from "@/lib/memory/vector-memory";
import { enforceAgentMemoryPolicy } from "@/lib/agent/memory-context";
import { resolveAgentMemoryPolicy } from "@/lib/agent/memory-policy";

const ALLOWED_FILTERS = new Set([
  "resume",
  "jd",
  "offer",
  "interview",
  "report",
  "profile",
  "cv",
  "reference_resume",
  "jd_report",
  "offer_report",
  "session",
  "story",
  "profile_signal",
]);

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({})) as {
      query?: string;
      sourceTypes?: string[];
      limit?: number;
      task?: string;
      agentId?: string;
    };

    const query = (body.query || "").trim();
    if (!query) {
      return NextResponse.json({ success: false, error: "query is required" }, { status: 400 });
    }

    const policy = resolveAgentMemoryPolicy(body.task);
    const requestedSourceTypes = normalizeMemorySourceFilters(normalizeSourceTypes(body.sourceTypes));
    const sourceTypes = requestedSourceTypes.length
      ? policy.allowedSourceTypes.filter((sourceType) => requestedSourceTypes.includes(sourceType))
      : policy.allowedSourceTypes;
    if (policy.semanticTopK <= 0 || sourceTypes.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          snippets: [],
          policyId: policy.id,
          task: policy.task,
          deniedSources: [],
          warnings: ["semantic_memory_denied_by_policy"],
        },
      });
    }

    const snippets = await retrieveMemorySnippets({
      userId: user.userId,
      query,
      sourceTypes,
      limit: Math.min(body.limit || policy.semanticTopK, policy.maxSemanticSnippets),
    });
    const enforced = enforceAgentMemoryPolicy({
      policy,
      agentId: body.agentId,
      structuredFacts: [],
      semanticSnippets: snippets,
    });

    return NextResponse.json({
      success: true,
      data: {
        snippets: enforced.semanticSnippets,
        deniedSources: enforced.deniedSources,
        policyId: policy.id,
        task: policy.task,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[memory/retrieve] failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function normalizeSourceTypes(sourceTypes: string[] | undefined): MemorySourceFilter[] {
  if (!Array.isArray(sourceTypes)) return [];
  return sourceTypes
    .map((item) => item.trim())
    .filter((item): item is MemorySourceFilter => ALLOWED_FILTERS.has(item));
}
