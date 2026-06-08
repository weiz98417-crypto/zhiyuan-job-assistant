import { getDataRepositories } from "@/lib/data-repositories";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import {
  listMemoryItems,
  retrieveMemorySnippets,
  type MemoryItemRecord,
} from "@/lib/memory/postgres-memory";
import {
  buildMemoryPolicyDenial,
  detectMemoryTaskConflict,
  evaluateMemoryPolicySource,
  resolveAgentMemoryPolicy,
  type AgentMemoryPolicy,
  type AgentMemoryResolvedTask,
  type AgentStructuredMemoryScope,
  type MemoryPolicyDenial,
} from "@/lib/agent/memory-policy";
import {
  extractTextFromUnknown,
  type MemorySnippet,
  type MemorySourceType,
} from "@/lib/memory/vector-memory";

export { resolveAgentMemoryPolicy } from "@/lib/agent/memory-policy";

export interface StructuredMemoryFact {
  label: string;
  sourceType: MemorySourceType;
  sourceId?: string | number;
  text: string;
  status?: string;
  visibility?: string;
  memoryType?: string;
  confidence?: number;
  importance?: number;
}

export interface AgentMemoryContext {
  task: AgentMemoryResolvedTask;
  policyId: string;
  agentId: string;
  sourceTypes: MemorySourceType[];
  structuredFacts: StructuredMemoryFact[];
  semanticSnippets: MemorySnippet[];
  llmSummary: string;
  warnings: string[];
  deniedSources: MemoryPolicyDenial[];
}

export interface AssembleAgentMemoryContextInput {
  userId: string;
  task?: string;
  agentId?: string;
  query?: string;
  budgetChars?: number;
  semanticTopK?: number;
  semanticSnippets?: MemorySnippet[];
  userTextTask?: string;
  contentTask?: string;
}

export async function assembleAgentMemoryContext(input: AssembleAgentMemoryContextInput): Promise<AgentMemoryContext> {
  const policy = resolveAgentMemoryPolicy(input.task);
  const agentId = input.agentId || inferAgentId(policy.task);
  const warnings: string[] = [];
  let deniedSources: MemoryPolicyDenial[] = [];
  const conflict = detectMemoryTaskConflict({
    userTextTask: input.userTextTask || input.task,
    contentTask: input.contentTask,
  });

  if (conflict.requiresClarification) {
    warnings.push(`clarification_required:${conflict.reason}`);
    return buildEmptyContext({ policy, agentId, warnings, deniedSources });
  }

  const rawStructuredFacts = await readStructuredFacts(input.userId, policy).catch((error) => {
    warnings.push(`structured:${error instanceof Error ? error.message : String(error)}`);
    return [] as StructuredMemoryFact[];
  });

  let semanticSnippets = input.semanticSnippets || [];
  if (
    !input.semanticSnippets
    && input.query?.trim()
    && policy.semanticTopK > 0
    && getDatabaseDriver() === "postgres"
    && isPostgresConfigured()
  ) {
    try {
      semanticSnippets = await retrieveMemorySnippets({
        userId: input.userId,
        query: input.query,
        sourceTypes: policy.allowedSourceTypes,
        limit: Math.min(input.semanticTopK || policy.semanticTopK, policy.maxSemanticSnippets),
      });
    } catch (error) {
      warnings.push(`semantic:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const enforced = enforceAgentMemoryPolicy({
    policy,
    agentId,
    structuredFacts: rawStructuredFacts,
    semanticSnippets,
  });
  deniedSources = enforced.deniedSources;
  logMemoryPolicyDenials(deniedSources);

  const llmSummary = formatAgentMemoryContext({
    task: policy.task,
    policyId: policy.id,
    sourceTypes: policy.allowedSourceTypes,
    structuredFacts: enforced.structuredFacts,
    semanticSnippets: enforced.semanticSnippets,
    budgetChars: input.budgetChars || policy.budgetChars,
  });

  return {
    task: policy.task,
    policyId: policy.id,
    agentId,
    sourceTypes: policy.allowedSourceTypes,
    structuredFacts: enforced.structuredFacts,
    semanticSnippets: enforced.semanticSnippets,
    llmSummary,
    warnings,
    deniedSources,
  };
}

export function formatAgentMemoryContext(input: {
  task: AgentMemoryResolvedTask;
  policyId?: string;
  sourceTypes: MemorySourceType[];
  structuredFacts: StructuredMemoryFact[];
  semanticSnippets: MemorySnippet[];
  budgetChars: number;
}): string {
  const lines: string[] = [
    `Agent memory task=${input.task}`,
    `[policy:${input.policyId || "unknown"} sources=${input.sourceTypes.length}]`,
  ];

  for (const fact of input.structuredFacts) {
    const sourceId = fact.sourceId === undefined ? "" : `#${fact.sourceId}`;
    const status = fact.status ? ` status=${fact.status}` : "";
    const memoryType = fact.memoryType ? ` memoryType=${fact.memoryType}` : "";
    const confidence = fact.confidence !== undefined ? ` confidence=${fact.confidence}` : "";
    lines.push(`[structured:${fact.sourceType}${sourceId}${status}${memoryType}${confidence}] ${compactLine(fact.label)}: ${compactLine(fact.text, 360)}`);
  }

  for (const snippet of input.semanticSnippets) {
    const metadata = readSnippetMetadata(snippet);
    const status = metadata.status ? ` status=${metadata.status}` : "";
    const memoryType = metadata.memoryType ? ` memoryType=${metadata.memoryType}` : "";
    lines.push(`[semantic:${snippet.sourceType}#${snippet.sourceId}${status}${memoryType} score=${snippet.score.toFixed(2)}] ${compactLine(snippet.snippet, 360)}`);
  }

  return applyBudget(lines.join("\n"), input.budgetChars);
}

async function readStructuredFacts(userId: string, policy: AgentMemoryPolicy): Promise<StructuredMemoryFact[]> {
  const repos = getDataRepositories();
  const facts: StructuredMemoryFact[] = [];
  const wants = (scope: AgentStructuredMemoryScope) => policy.structuredScopes.includes(scope);

  if (wants("profile")) {
    const profile = await repos.profiles.get(userId).catch(() => undefined);
    if (profile) {
      facts.push({
        label: "profile",
        sourceType: "profile",
        sourceId: profile.id,
        text: summarizeJson({
          data: parseJson(profile.data_json),
          goals: parseJson(profile.goals_json),
        }, 700),
      });
    }
  }

  if (wants("cv")) {
    const cv = await repos.cv.get(userId).catch(() => undefined);
    if (cv?.data_json) {
      facts.push({
        label: "current CV",
        sourceType: "cv",
        text: summarizeJson(parseJson(cv.data_json), 900),
      });
    }
  }

  if (wants("jds")) {
    const jds = await repos.jds.list(userId).catch(() => []);
    for (const jd of jds.slice(0, 3)) {
      facts.push({
        label: `${jd.company || "Unknown company"} ${jd.role || "Unknown role"}`,
        sourceType: "jd",
        sourceId: jd.id,
        text: compactLine(jd.body || "", 500),
      });
    }
  }

  if (wants("reports")) {
    const reports = await repos.reports.list(userId).catch(() => []);
    for (const report of reports.slice(0, 3)) {
      facts.push({
        label: `${report.company || "Unknown company"} ${report.role || "Unknown role"}`,
        sourceType: "jd_report",
        sourceId: report.report_num,
        text: `score=${report.overall_score || 0}; legitimacy=${report.legitimacy || ""}; blocks=${summarizeJson(parseJson(report.blocks_json), 500)}`,
      });
    }
  }

  if (wants("offers")) {
    const offers = await repos.offers.list(userId).catch(() => []);
    for (const offer of offers.slice(0, 3)) {
      facts.push({
        label: `${String(offer.company || "Unknown company")} ${String(offer.role || "Unknown role")}`,
        sourceType: "offer",
        sourceId: Number(offer.id || 0) || undefined,
        text: summarizeJson(offer, 520),
      });
    }
  }

  if (wants("offer_reports")) {
    const offerReports = await repos.offerReports.list(userId).catch(() => []);
    for (const report of offerReports.slice(0, 3)) {
      facts.push({
        label: String(report.title || "Offer report"),
        sourceType: "offer_report",
        sourceId: Number(report.id || 0) || undefined,
        text: summarizeJson({
          score: report.overall_score,
          verdict: report.verdict,
          summary: report.summary,
          redFlags: parseJson(String(report.red_flags_json || "[]")),
        }, 520),
      });
    }
  }

  if (wants("sessions")) {
    const sessions = await repos.sessions.list(userId).catch(() => []);
    for (const session of sessions.slice(0, 3)) {
      facts.push({
        label: String(session.title || "Session"),
        sourceType: "session",
        sourceId: Number(session.id || 0) || undefined,
        text: compactLine(String(session.memory_digest || ""), 360),
      });
    }
  }

  if (wants("memory_items") && getDatabaseDriver() === "postgres" && isPostgresConfigured()) {
    const statuses = policy.allowedMemoryStatuses
      .filter((status) => status !== "candidate" || policy.allowCandidateMemory);
    const memoryTypes = policy.allowedMemoryTypes && policy.allowedMemoryTypes.length > 0
      ? policy.allowedMemoryTypes
      : undefined;
    const items = memoryTypes
      ? await listMemoryItems({
        userId,
        statuses: statuses.length ? statuses : ["active"],
        memoryTypes,
        limit: policy.maxStructuredFacts,
      }).catch(() => [])
      : [];
    facts.push(...items.map(memoryItemToFact));
  }

  return facts.filter((fact) => fact.text.trim());
}

function memoryItemToFact(item: MemoryItemRecord): StructuredMemoryFact {
  const metadata = parseJson(item.metadata_json) as Record<string, unknown>;
  return {
    label: item.memory_type,
    sourceType: memoryItemSourceType(item.memory_type),
    sourceId: item.id,
    text: item.canonical_text,
    status: item.status,
    visibility: typeof metadata.visibility === "string" ? metadata.visibility : "private",
    memoryType: item.memory_type,
    confidence: Number(item.confidence || 0),
    importance: Number(item.importance || 0),
  };
}

export function enforceAgentMemoryPolicy(input: {
  policy: AgentMemoryPolicy;
  agentId?: string;
  structuredFacts: StructuredMemoryFact[];
  semanticSnippets: MemorySnippet[];
}): {
  structuredFacts: StructuredMemoryFact[];
  semanticSnippets: MemorySnippet[];
  deniedSources: MemoryPolicyDenial[];
} {
  const deniedSources: MemoryPolicyDenial[] = [];
  const agentId = input.agentId || "unknown";

  const structuredFacts = input.structuredFacts.filter((fact) => {
    const decision = evaluateMemoryPolicySource(input.policy, {
      sourceKind: fact.memoryType ? "memory_item" : "structured",
      sourceType: fact.sourceType,
      sourceId: fact.sourceId,
      memoryType: fact.memoryType,
      status: fact.status,
      visibility: fact.visibility,
    });
    if (decision.allowed) return true;
    deniedSources.push(buildMemoryPolicyDenial({
      policy: input.policy,
      agentId,
      candidate: {
        sourceKind: fact.memoryType ? "memory_item" : "structured",
        sourceType: fact.sourceType,
        sourceId: fact.sourceId,
        memoryType: fact.memoryType,
        status: fact.status,
        visibility: fact.visibility,
      },
      reason: decision.reason,
    }));
    return false;
  }).slice(0, input.policy.maxStructuredFacts);

  const semanticSnippets = input.semanticSnippets.filter((snippet) => {
    const metadata = readSnippetMetadata(snippet);
    const decision = evaluateMemoryPolicySource(input.policy, {
      sourceKind: "semantic",
      sourceType: snippet.sourceType,
      sourceId: snippet.sourceId,
      memoryType: metadata.memoryType,
      status: metadata.status,
      visibility: metadata.visibility,
    });
    if (decision.allowed) return true;
    deniedSources.push(buildMemoryPolicyDenial({
      policy: input.policy,
      agentId,
      candidate: {
        sourceKind: "semantic",
        sourceType: snippet.sourceType,
        sourceId: snippet.sourceId,
        memoryType: metadata.memoryType,
        status: metadata.status,
        visibility: metadata.visibility,
      },
      reason: decision.reason,
    }));
    return false;
  }).slice(0, input.policy.maxSemanticSnippets);

  return { structuredFacts, semanticSnippets, deniedSources };
}

function buildEmptyContext(input: {
  policy: AgentMemoryPolicy;
  agentId: string;
  warnings: string[];
  deniedSources: MemoryPolicyDenial[];
}): AgentMemoryContext {
  return {
    task: input.policy.task,
    policyId: input.policy.id,
    agentId: input.agentId,
    sourceTypes: input.policy.allowedSourceTypes,
    structuredFacts: [],
    semanticSnippets: [],
    llmSummary: formatAgentMemoryContext({
      task: input.policy.task,
      policyId: input.policy.id,
      sourceTypes: input.policy.allowedSourceTypes,
      structuredFacts: [],
      semanticSnippets: [],
      budgetChars: input.policy.budgetChars,
    }),
    warnings: input.warnings,
    deniedSources: input.deniedSources,
  };
}

function readSnippetMetadata(snippet: MemorySnippet): {
  memoryType?: string;
  status?: string;
  visibility?: string;
} {
  const metadata = snippet.metadata || {};
  return {
    memoryType: readStringMetadata(metadata, ["memoryType", "memory_type", "type"]),
    status: readStringMetadata(metadata, ["status", "memoryStatus", "referenceStatus"]),
    visibility: readStringMetadata(metadata, ["visibility", "scope"]),
  };
}

function readStringMetadata(metadata: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function memoryItemSourceType(memoryType: string): MemorySourceType {
  if (memoryType.startsWith("jd_")) return "jd_report";
  if (memoryType.startsWith("offer_") || memoryType.includes("compensation") || memoryType.includes("work_style")) return "offer_report";
  if (memoryType.startsWith("interview_")) return "interview";
  if (memoryType === "excellent_resume_pattern" || memoryType.startsWith("resume_")) return "reference_resume";
  return "profile_signal";
}

function inferAgentId(task: AgentMemoryResolvedTask): string {
  if (task === "jd_evaluation") return "evaluate";
  if (task === "offer_evaluation") return "offer";
  if (task === "resume_optimization" || task === "reference_resume_save") return "resume";
  if (task === "interview_coaching") return "interview";
  if (task === "profile_growth") return "profile";
  if (task === "general_chat") return "general";
  return "unknown";
}

function logMemoryPolicyDenials(denials: MemoryPolicyDenial[]): void {
  if (!denials.length || process.env.NODE_ENV === "production") return;
  console.warn("[agent-memory-policy] denied sources", denials);
}

function summarizeJson(value: unknown, maxChars: number): string {
  return compactLine(extractTextFromUnknown(value), maxChars);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function compactLine(value: string, maxChars = 180): string {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 3).trim()}...`;
}

function applyBudget(value: string, budgetChars: number): string {
  if (value.length <= budgetChars) return value;
  return `${value.slice(0, Math.max(0, budgetChars - 70)).trim()}\n[agent-memory truncated to fit context budget]`;
}
