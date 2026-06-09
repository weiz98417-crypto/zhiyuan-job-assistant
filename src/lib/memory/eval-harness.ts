import {
  embedChunksWithRetry,
  type EmbeddedMemoryChunk,
  type EmbeddingProvider,
  type MemoryChunkInput,
} from "@/lib/memory/vector-memory";
import {
  computeReferenceSnippetScore,
  normalizeReferenceVisibility,
  normalizeRoleCategory,
  type ReferenceResumeVisibility,
} from "@/lib/reference-resume-vector";

export type MemoryEvalTaskType =
  | "resume_optimization"
  | "jd_evaluation"
  | "offer_evaluation"
  | "interview_coaching"
  | "general_chat";

export type MemoryEvalSourceType =
  | "reference_resume_raw"
  | "excellent_resume_pattern"
  | "cv"
  | "jd"
  | "offer"
  | "profile";

export interface MemoryEvalReference {
  id: number;
  ownerUserId: string;
  name: string;
  roleCategory: string;
  sectionType: string;
  text: string;
  visibility: ReferenceResumeVisibility;
  status: "active" | "pending" | "disabled" | "index_failed";
  quality: number;
  acceptedCount?: number;
  rejectedCount?: number;
  redacted?: boolean;
}

export interface MemoryEvalSnippet {
  referenceId: number;
  sourceLabel: string;
  roleCategory: string;
  sectionType: string;
  visibility: ReferenceResumeVisibility;
  similarity: number;
  score: number;
  snippet: string;
}

export interface MemoryEvalSource {
  id: string;
  type: MemoryEvalSourceType;
  ownerUserId?: string;
  visibility?: ReferenceResumeVisibility;
  status?: string;
  text?: string;
}

export interface MemoryPolicyViolation {
  sourceId: string;
  sourceType: MemoryEvalSourceType;
  reason: string;
}

export interface MemoryEvalReport {
  retrievalHitAtK: boolean;
  expectedReferenceIds: number[];
  retrievedReferenceIds: number[];
  sourceLabels: string[];
  copyOverlapScore: number;
  qualityDelta: number;
  policyViolations: MemoryPolicyViolation[];
}

export interface PatternGuidanceCandidate {
  id: string | number;
  status: "candidate" | "active" | "rejected" | "disabled" | "deprecated";
  text: string;
  confidence: number;
  importance: number;
  evidenceCount: number;
}

const KEYWORDS = [
  "ai",
  "product",
  "manager",
  "rag",
  "agent",
  "prompt",
  "workflow",
  "metrics",
  "dashboard",
  "data",
  "bi",
  "user",
  "launch",
  "evaluation",
  "resume",
  "jd",
  "offer",
  "salary",
  "interview",
  "computer",
  "vision",
  "hardware",
  "operations",
  "presales",
  "growth",
  "risk",
  "supplier",
  "finance",
  "project",
  "experiment",
  "conversion",
  "analytics",
  "roadmap",
  "stakeholder",
];

export function createMemoryEvalEmbeddingProvider(dimension = 1536): EmbeddingProvider {
  return {
    model: "memory-eval-keyword-embedding",
    dimension,
    async embed(texts) {
      return texts.map((text) => createMemoryEvalEmbedding(text, dimension));
    },
  };
}

export function createMemoryEvalEmbedding(text: string, dimension = 1536): number[] {
  if (dimension < KEYWORDS.length) {
    throw new Error(`Memory eval embedding dimension must be at least ${KEYWORDS.length}`);
  }
  const normalized = normalizeText(text).toLowerCase();
  const vector = new Array(dimension).fill(0);
  KEYWORDS.forEach((keyword, index) => {
    const count = countKeyword(normalized, keyword);
    if (count > 0) vector[index] = 1 + Math.log(count);
  });
  // Add a tiny deterministic lexical fallback so non-keyword texts are still stable.
  for (const token of normalized.match(/[a-z0-9]{3,}/g) || []) {
    const index = KEYWORDS.length + (stableTokenHash(token) % Math.max(1, dimension - KEYWORDS.length));
    vector[index] += 0.08;
  }
  return normalizeVector(vector);
}

export function runReferenceRetrievalEval(input: {
  userId: string;
  query: string;
  roleCategory?: string;
  sectionType?: string;
  limit?: number;
  references: MemoryEvalReference[];
}): MemoryEvalSnippet[] {
  const queryEmbedding = createMemoryEvalEmbedding(input.query);
  const roleCategory = normalizeRoleCategory(input.roleCategory, input.query);
  const limit = Math.max(1, Math.min(input.limit || 5, 12));

  return input.references
    .filter((reference) => isReferenceEligible(reference, input.userId, roleCategory, input.sectionType))
    .map((reference) => {
      const similarity = cosineSimilarity(queryEmbedding, createMemoryEvalEmbedding(reference.text));
      const rowRole = normalizeRoleCategory(reference.roleCategory, reference.text);
      const roleScore = rowRole === roleCategory ? 1 : rowRole === "general" || !rowRole ? 0.65 : 0.35;
      const score = computeReferenceSnippetScore({
        similarity,
        quality: reference.quality,
        roleScore,
        acceptedCount: reference.acceptedCount,
        rejectedCount: reference.rejectedCount,
      });
      return {
        referenceId: reference.id,
        sourceLabel: `reference_resume:${reference.id}:${reference.sectionType || "raw"}`,
        roleCategory: rowRole,
        sectionType: reference.sectionType,
        visibility: normalizeReferenceVisibility(reference.visibility),
        similarity,
        score,
        snippet: compactSnippet(reference.text),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildMemoryEvalReport(input: {
  expectedReferenceIds: number[];
  retrieved: MemoryEvalSnippet[];
  taskType: MemoryEvalTaskType;
  userId: string;
  sources: MemoryEvalSource[];
  noMemoryOutput?: string;
  memoryOutput?: string;
  referenceTexts?: string[];
}): MemoryEvalReport {
  const retrievedReferenceIds = input.retrieved.map((snippet) => snippet.referenceId);
  const expected = new Set(input.expectedReferenceIds);
  const retrievalHitAtK = retrievedReferenceIds.some((id) => expected.has(id));
  const referenceTexts = input.referenceTexts || input.sources.map((source) => source.text || "").filter(Boolean);
  const copyOverlapScore = input.memoryOutput
    ? computeCopyOverlapScore(input.memoryOutput, referenceTexts)
    : 0;
  const qualityDelta = scoreResumeOptimizationOutput(input.memoryOutput || "")
    - scoreResumeOptimizationOutput(input.noMemoryOutput || "");

  return {
    retrievalHitAtK,
    expectedReferenceIds: input.expectedReferenceIds,
    retrievedReferenceIds,
    sourceLabels: input.retrieved.map((snippet) => snippet.sourceLabel),
    copyOverlapScore,
    qualityDelta: Number(qualityDelta.toFixed(4)),
    policyViolations: detectMemoryPolicyViolations({
      taskType: input.taskType,
      userId: input.userId,
      sources: input.sources,
    }),
  };
}

export function formatMemoryEvalReport(report: MemoryEvalReport): string {
  return [
    "# Memory Eval Report",
    "",
    `- retrieval_hit_at_k: ${report.retrievalHitAtK}`,
    `- expected_reference_ids: ${report.expectedReferenceIds.join(",") || "none"}`,
    `- retrieved_reference_ids: ${report.retrievedReferenceIds.join(",") || "none"}`,
    `- source_labels: ${report.sourceLabels.join(",") || "none"}`,
    `- copy_overlap_score: ${report.copyOverlapScore.toFixed(4)}`,
    `- quality_delta: ${report.qualityDelta.toFixed(4)}`,
    `- policy_violation_count: ${report.policyViolations.length}`,
  ].join("\n");
}

export function detectMemoryPolicyViolations(input: {
  taskType: MemoryEvalTaskType;
  userId: string;
  sources: MemoryEvalSource[];
}): MemoryPolicyViolation[] {
  const violations: MemoryPolicyViolation[] = [];
  for (const source of input.sources) {
    const visibility = normalizeReferenceVisibility(source.visibility);
    const owner = source.ownerUserId || input.userId;
    if (visibility === "private" && owner !== input.userId) {
      violations.push({
        sourceId: source.id,
        sourceType: source.type,
        reason: "private source belongs to another user",
      });
    }
    if (visibility === "team_pending" && owner !== input.userId) {
      violations.push({
        sourceId: source.id,
        sourceType: source.type,
        reason: "pending team source is not approved for shared retrieval",
      });
    }
    if (source.status && source.status !== "active" && source.status !== "candidate") {
      violations.push({
        sourceId: source.id,
        sourceType: source.type,
        reason: `source status is not retrievable: ${source.status}`,
      });
    }
    if (
      source.type === "reference_resume_raw"
      && input.taskType !== "resume_optimization"
    ) {
      violations.push({
        sourceId: source.id,
        sourceType: source.type,
        reason: `raw excellent resume snippets are not allowed for ${input.taskType}`,
      });
    }
  }
  return violations;
}

export function computeCopyOverlapScore(output: string, referenceTexts: string[], ngramSize = 6): number {
  const outputNgrams = buildWordNgrams(output, ngramSize);
  if (!outputNgrams.size) return 0;
  let maxOverlap = 0;
  for (const referenceText of referenceTexts) {
    const referenceNgrams = buildWordNgrams(referenceText, ngramSize);
    if (!referenceNgrams.size) continue;
    let overlap = 0;
    for (const ngram of outputNgrams) {
      if (referenceNgrams.has(ngram)) overlap += 1;
    }
    maxOverlap = Math.max(maxOverlap, overlap / Math.min(outputNgrams.size, referenceNgrams.size));
  }
  return Number(maxOverlap.toFixed(4));
}

export function scoreResumeOptimizationOutput(text: string): number {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return 0;
  let score = 0.2;
  if (/rag|agent|prompt|workflow|ai/.test(normalized)) score += 0.18;
  if (/metric|conversion|accuracy|retention|mau|dau|%|\d+x|\d+\s*(users|teams|projects)/.test(normalized)) score += 0.2;
  if (/launched|delivered|owned|designed|led|built|drove|shipped/.test(normalized)) score += 0.16;
  if (/problem|goal|action|result|impact|stakeholder|tradeoff/.test(normalized)) score += 0.12;
  if (/jd|role|business|customer|user/.test(normalized)) score += 0.08;
  if (normalized.length >= 240) score += 0.06;
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

export function selectActivePatternGuidance(patterns: PatternGuidanceCandidate[]): PatternGuidanceCandidate[] {
  return patterns
    .filter((pattern) => pattern.status === "active")
    .filter((pattern) => pattern.confidence >= 0.65)
    .filter((pattern) => pattern.importance >= 0.55)
    .filter((pattern) => pattern.evidenceCount >= 1)
    .filter((pattern) => normalizeText(pattern.text).length >= 32)
    .sort((a, b) => (b.importance + b.confidence) - (a.importance + a.confidence));
}

export async function runEmbeddingFailureEval(input: {
  chunks: MemoryChunkInput[];
  provider: EmbeddingProvider;
}): Promise<{
  savedReferencePreserved: boolean;
  failed: number;
  embedded: number;
  reindexableChunkHashes: string[];
  results: EmbeddedMemoryChunk[];
}> {
  const results = await embedChunksWithRetry(input.chunks, input.provider, { maxRetries: 1 });
  return {
    savedReferencePreserved: results.length === input.chunks.length,
    failed: results.filter((item) => item.embeddingStatus === "failed").length,
    embedded: results.filter((item) => item.embeddingStatus === "embedded").length,
    reindexableChunkHashes: results
      .filter((item) => item.embeddingStatus === "failed")
      .map((item) => item.chunk.contentHash),
    results,
  };
}

function isReferenceEligible(
  reference: MemoryEvalReference,
  userId: string,
  roleCategory: string,
  sectionType?: string,
): boolean {
  if (reference.status !== "active") return false;
  const visibility = normalizeReferenceVisibility(reference.visibility);
  const ownerVisible = reference.ownerUserId === userId
    && (visibility === "private" || visibility === "team_pending" || visibility === "team");
  const sharedVisible = visibility === "team";
  if (!ownerVisible && !sharedVisible) return false;

  const rowRole = normalizeRoleCategory(reference.roleCategory, reference.text);
  if (roleCategory && roleCategory !== "general" && rowRole !== roleCategory && rowRole !== "general") return false;
  if (sectionType && reference.sectionType && reference.sectionType !== sectionType) return false;
  return true;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] * a[index];
    bNorm += b[index] * b[index];
  }
  if (!aNorm || !bNorm) return 0;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm))));
}

function countKeyword(text: string, keyword: string): number {
  const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "g");
  return text.match(pattern)?.length || 0;
}

function buildWordNgrams(text: string, size: number): Set<string> {
  const tokens = normalizeText(text).toLowerCase().match(/[a-z0-9]+/g) || [];
  const ngrams = new Set<string>();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    ngrams.add(tokens.slice(index, index + size).join(" "));
  }
  return ngrams;
}

function compactSnippet(text: string, maxChars = 360): string {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}...`;
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  if (!norm) return vector.map((_, index) => index === 0 ? 1 : 0);
  return vector.map((value) => Number((value / norm).toFixed(8)));
}

function stableTokenHash(token: string): number {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = ((hash << 5) - hash + token.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
