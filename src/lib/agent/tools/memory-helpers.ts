import type { AgentMemoryContext, AgentMemoryTask } from "@/lib/agent/memory-context";
import type { MemorySourceType } from "@/lib/memory/vector-memory";

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

export async function fetchAgentMemoryContext(input: {
  task: AgentMemoryTask;
  query?: string;
  budgetChars?: number;
  semanticTopK?: number;
}): Promise<AgentMemoryContext | null> {
  try {
    const res = await fetch(apiPath("/api/agent/memory-context"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.success ? json.data as AgentMemoryContext : null;
  } catch {
    return null;
  }
}

export async function indexAgentMemorySource(input: {
  sourceType: MemorySourceType;
  sourceId: string | number;
  text: string;
  title?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(apiPath("/api/agent/memory-index"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    /* best effort */
  }
}

export async function writeCandidateAgentMemory(input: {
  memoryType: string;
  canonicalText: string;
  sourceType: string;
  sourceId?: string | number;
  quote?: string;
  confidence?: number;
  importance?: number;
  extractionMethod?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(apiPath("/api/agent/memory-writeback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    /* best effort */
  }
}
