import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getProfileBlocks, listFactProvenance, searchFactsHybrid, type FactProvenance } from "@/lib/memory/fact-ledger";
import { createEmbeddingProvider, normalizeMemorySourceFilters, type EmbeddingProvider, type MemorySnippet, type MemorySourceFilter } from "@/lib/memory/vector-memory";
import { assertMemoryGateOpen } from "@/lib/memory/runtime-gates";
import { expandGovernedFactSourceTypes } from "@/lib/memory/source-policy";

export interface GovernedMemoryResult {
  snippets: MemorySnippet[];
  facts: Array<FactProvenance & {
    score: number;
    ranking: {
      total: number;
      semantic: number;
      confidence: number;
      importance: number;
      recency: number;
      source: number;
      entity: number;
    };
  }>;
  profile: Array<{
    topic: string;
    subTopic: string;
    value: Record<string, unknown>;
    label: string | null;
    source: string;
    factIds: number[];
    lastConfirmedAt: string | null;
    reviewDueAt: string | null;
    reviewDue: boolean;
  }>;
  warnings: string[];
}

export async function retrieveGovernedMemory(input: {
  principal: ExecutionPrincipal;
  agentId: string;
  query: string;
  sourceTypes?: MemorySourceFilter[];
  limit?: number;
}): Promise<GovernedMemoryResult> {
  await assertMemoryReadGateOpen();
  const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
  const warnings: string[] = [];
  const sources = input.sourceTypes === undefined ? undefined : normalizeMemorySourceFilters(input.sourceTypes);
  const includeProfile = sources === undefined || sources.includes("profile") || sources.includes("profile_signal");
  let embedding: number[] | null = null;
  try {
    const provider: EmbeddingProvider = createEmbeddingProvider();
    [embedding] = await provider.embed([input.query]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = /disabled/i.test(message) ? "disabled"
      : /required|dimension|configuration/i.test(message) ? "configuration"
        : /429/i.test(message) ? "rate_limited" : "provider_failure";
    warnings.push(`embedding:${reason}`, "embedding:semantic_unavailable");
  }
  const [factRows, profile] = await Promise.all([
    searchFactsHybrid(input.principal, {
      queryText: input.query,
      queryEmbedding: embedding,
      agentId: input.agentId,
      sourceTypes: expandGovernedFactSourceTypes(input.sourceTypes),
      limit,
    }).catch(() => {
      warnings.push("facts:unavailable");
      return [] as Awaited<ReturnType<typeof searchFactsHybrid>>;
    }),
    includeProfile ? getProfileBlocks(input.principal, undefined, input.agentId, { includeReviewDue: true, sourceTypes: expandGovernedFactSourceTypes(input.sourceTypes) }).catch(() => {
      warnings.push("profile:unavailable");
      return [] as GovernedMemoryResult["profile"];
    }) : Promise.resolve([] as GovernedMemoryResult["profile"]),
  ]);
  const factResults = await Promise.all(factRows.slice(0, limit * 2).map(async (row) => {
    const provenance = await listFactProvenance(input.principal, row.factId, input.agentId).catch(() => {
      warnings.push("provenance:unavailable");
      return null;
    });
    if (!provenance || provenance.invalidAt) return null;
    const ranking = rankFact({
      semantic: row.score,
      entity: row.entityScore,
      confidence: row.confidence,
      importance: row.importance,
      validAt: row.validAt,
      sourceType: row.sourceType,
    });
    return { ...provenance, score: ranking.total, ranking };
  }));
  const facts = factResults.filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
  await assertMemoryReadGateOpen();
  return { snippets: [], facts, profile, warnings: [...new Set(warnings)] };
}

const FACT_SOURCE_RELIABILITY: Record<string, number> = {
  verified_task: 1,
  profile: 0.95,
  interview: 0.9,
  session: 0.82,
  user: 0.8,
  agent: 0.65,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeRrfScore(value: number): number {
  return clampScore(value * 30);
}

function recencyScore(value: Date): number {
  const ageDays = Math.max(0, (Date.now() - value.getTime()) / (24 * 60 * 60 * 1000));
  return Math.exp(-ageDays / 180);
}

function rankFact(input: {
  semantic: number;
  entity: number;
  confidence: number;
  importance: number;
  validAt: Date;
  sourceType: string | null;
}): GovernedMemoryResult["facts"][number]["ranking"] {
  const semantic = normalizeRrfScore(input.semantic);
  const entity = normalizeRrfScore(input.entity);
  const confidence = clampScore(input.confidence);
  const importance = clampScore(input.importance);
  const recency = recencyScore(input.validAt);
  const source = FACT_SOURCE_RELIABILITY[input.sourceType || ""] ?? 0.6;
  const total = clampScore(
    (semantic * 0.5)
      + (confidence * 0.16)
      + (importance * 0.12)
      + (recency * 0.12)
      + (source * 0.1)
      + (entity * 0.08),
  );
  return { total, semantic, confidence, importance, recency, source, entity };
}

export async function assertMemoryReadGateOpen(): Promise<void> {
  await assertMemoryGateOpen("read");
}
