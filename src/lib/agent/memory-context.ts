import { getDataRepositories } from "@/lib/data-repositories";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import {
  listMemoryItems,
  retrieveMemorySnippets,
  type MemoryItemRecord,
} from "@/lib/memory/postgres-memory";
import {
  extractTextFromUnknown,
  type MemorySnippet,
  type MemorySourceFilter,
} from "@/lib/memory/vector-memory";

export type AgentMemoryTask = "jd" | "offer" | "resume" | "interview" | "profile" | "general_chat";

export interface AgentMemoryPolicy {
  task: AgentMemoryTask;
  sourceTypes: MemorySourceFilter[];
  structuredScopes: Array<"profile" | "cv" | "jds" | "reports" | "offers" | "offer_reports" | "memory_items" | "sessions">;
  semanticTopK: number;
  budgetChars: number;
}

export interface StructuredMemoryFact {
  label: string;
  sourceType: string;
  sourceId?: string | number;
  text: string;
  status?: string;
  confidence?: number;
  importance?: number;
}

export interface AgentMemoryContext {
  task: AgentMemoryTask;
  sourceTypes: MemorySourceFilter[];
  structuredFacts: StructuredMemoryFact[];
  semanticSnippets: MemorySnippet[];
  llmSummary: string;
  warnings: string[];
}

export interface AssembleAgentMemoryContextInput {
  userId: string;
  task: AgentMemoryTask;
  query?: string;
  budgetChars?: number;
  semanticTopK?: number;
  semanticSnippets?: MemorySnippet[];
}

export const AGENT_MEMORY_POLICIES: Record<AgentMemoryTask, AgentMemoryPolicy> = {
  jd: {
    task: "jd",
    sourceTypes: ["resume", "profile", "jd", "report"],
    structuredScopes: ["profile", "cv", "reports", "memory_items"],
    semanticTopK: 6,
    budgetChars: 2400,
  },
  offer: {
    task: "offer",
    sourceTypes: ["offer", "profile", "report"],
    structuredScopes: ["profile", "offers", "offer_reports", "memory_items"],
    semanticTopK: 6,
    budgetChars: 2200,
  },
  resume: {
    task: "resume",
    sourceTypes: ["resume", "jd", "profile", "report"],
    structuredScopes: ["profile", "cv", "jds", "reports", "memory_items"],
    semanticTopK: 6,
    budgetChars: 2400,
  },
  interview: {
    task: "interview",
    sourceTypes: ["resume", "jd", "report", "interview", "profile"],
    structuredScopes: ["profile", "cv", "jds", "reports", "sessions", "memory_items"],
    semanticTopK: 8,
    budgetChars: 2800,
  },
  profile: {
    task: "profile",
    sourceTypes: ["profile", "resume", "interview"],
    structuredScopes: ["profile", "cv", "sessions", "memory_items"],
    semanticTopK: 5,
    budgetChars: 1800,
  },
  general_chat: {
    task: "general_chat",
    sourceTypes: ["profile", "resume", "jd", "offer", "report", "interview"],
    structuredScopes: ["profile", "memory_items"],
    semanticTopK: 5,
    budgetChars: 1600,
  },
};

export function resolveAgentMemoryPolicy(task: AgentMemoryTask): AgentMemoryPolicy {
  return AGENT_MEMORY_POLICIES[task] || AGENT_MEMORY_POLICIES.general_chat;
}

export async function assembleAgentMemoryContext(input: AssembleAgentMemoryContextInput): Promise<AgentMemoryContext> {
  const policy = resolveAgentMemoryPolicy(input.task);
  const warnings: string[] = [];
  const structuredFacts = await readStructuredFacts(input.userId, policy).catch((error) => {
    warnings.push(`structured:${error instanceof Error ? error.message : String(error)}`);
    return [] as StructuredMemoryFact[];
  });

  let semanticSnippets = input.semanticSnippets || [];
  if (!input.semanticSnippets && input.query?.trim() && getDatabaseDriver() === "postgres" && isPostgresConfigured()) {
    try {
      semanticSnippets = await retrieveMemorySnippets({
        userId: input.userId,
        query: input.query,
        sourceTypes: policy.sourceTypes,
        limit: input.semanticTopK || policy.semanticTopK,
      });
    } catch (error) {
      warnings.push(`semantic:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const llmSummary = formatAgentMemoryContext({
    task: policy.task,
    sourceTypes: policy.sourceTypes,
    structuredFacts,
    semanticSnippets,
    budgetChars: input.budgetChars || policy.budgetChars,
  });

  return {
    task: policy.task,
    sourceTypes: policy.sourceTypes,
    structuredFacts,
    semanticSnippets,
    llmSummary,
    warnings,
  };
}

export function formatAgentMemoryContext(input: {
  task: AgentMemoryTask;
  sourceTypes: MemorySourceFilter[];
  structuredFacts: StructuredMemoryFact[];
  semanticSnippets: MemorySnippet[];
  budgetChars: number;
}): string {
  const lines: string[] = [
    `Agent memory context task=${input.task} filters=${input.sourceTypes.join(",")}`,
  ];

  for (const fact of input.structuredFacts) {
    const sourceId = fact.sourceId === undefined ? "" : `#${fact.sourceId}`;
    const status = fact.status ? ` status=${fact.status}` : "";
    const confidence = fact.confidence !== undefined ? ` confidence=${fact.confidence}` : "";
    lines.push(`[structured:${fact.sourceType}${sourceId}${status}${confidence}] ${compactLine(fact.label)}: ${compactLine(fact.text, 360)}`);
  }

  for (const snippet of input.semanticSnippets) {
    lines.push(`[semantic:${snippet.sourceType}#${snippet.sourceId} score=${snippet.score.toFixed(2)}] ${compactLine(snippet.snippet, 360)}`);
  }

  return applyBudget(lines.join("\n"), input.budgetChars);
}

async function readStructuredFacts(userId: string, policy: AgentMemoryPolicy): Promise<StructuredMemoryFact[]> {
  const repos = getDataRepositories();
  const facts: StructuredMemoryFact[] = [];
  const wants = (scope: AgentMemoryPolicy["structuredScopes"][number]) => policy.structuredScopes.includes(scope);

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
    const items = await listMemoryItems({ userId, limit: 12 }).catch(() => []);
    facts.push(...items.map(memoryItemToFact));
  }

  return facts.filter((fact) => fact.text.trim());
}

function memoryItemToFact(item: MemoryItemRecord): StructuredMemoryFact {
  return {
    label: item.memory_type,
    sourceType: "memory_item",
    sourceId: item.id,
    text: item.canonical_text,
    status: item.status,
    confidence: Number(item.confidence || 0),
    importance: Number(item.importance || 0),
  };
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
