import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { normalizeMemorySourceFilters, type MemorySourceFilter } from "@/lib/memory/vector-memory";
import { enforceAgentMemoryPolicy } from "@/lib/agent/memory-context";
import { resolveAgentMemoryPolicy } from "@/lib/agent/memory-policy";
import { retrieveGovernedMemory } from "@/lib/memory/retrieval";

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

    const trustedContext = resolveTrustedAgentContext(request);
    if ((body.task?.trim() || body.agentId?.trim()) && !trustedContext) {
      return NextResponse.json({ success: false, error: "Trusted agent execution context required" }, { status: 403 });
    }
    const task = trustedContext?.task;
    const agentId = trustedContext?.agentId || "user";

    const query = (body.query || "").trim();
    if (!query) {
      return NextResponse.json({ success: false, error: "query is required" }, { status: 400 });
    }

    const policy = resolveAgentMemoryPolicy(task);
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

    const governed = await retrieveGovernedMemory({
      principal: { userId: user.userId },
      agentId,
      query,
      sourceTypes,
      limit: Math.min(body.limit || policy.semanticTopK, policy.maxSemanticSnippets),
    });
    const enforced = enforceAgentMemoryPolicy({
      policy,
      agentId,
      structuredFacts: [],
      semanticSnippets: governed.snippets,
    });

    return NextResponse.json({
      success: true,
      data: {
        snippets: enforced.semanticSnippets,
        facts: governed.facts.filter((fact) => fact.sourceType !== null && policy.allowedSourceTypes.includes(fact.sourceType as typeof policy.allowedSourceTypes[number])),
        profile: governed.profile,
        deniedSources: enforced.deniedSources,
        policyId: policy.id,
        task: policy.task,
        warnings: governed.warnings,
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

function resolveTrustedAgentContext(request: Request): { agentId: string; task?: string } | null {
  const token = process.env.AGENT_INTERNAL_TOKEN?.trim();
  const suppliedToken = request.headers.get("x-agent-internal-token")?.trim();
  const agentId = request.headers.get("x-agent-id")?.trim();
  if (!token || !suppliedToken || suppliedToken !== token || !agentId) return null;
  if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(agentId)) return null;
  const task = request.headers.get("x-agent-task")?.trim() || undefined;
  return { agentId, task };
}

function normalizeSourceTypes(sourceTypes: string[] | undefined): MemorySourceFilter[] {
  if (!Array.isArray(sourceTypes)) return [];
  return sourceTypes
    .map((item) => item.trim())
    .filter((item): item is MemorySourceFilter => ALLOWED_FILTERS.has(item));
}
