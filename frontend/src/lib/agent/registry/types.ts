import type { ToolDefinition } from "@/lib/agent/tools/types";

// ── Knowledge domains for per-agent injection ──

export type KnowledgeDomain =
  | "salary-benchmarks"
  | "zhiyuan-levels"
  | "interview-styles"
  | "jd-signals";

// ── Suggestion chip (plain data, no React nodes) ──

export interface AgentSuggestion {
  label: string;
  prompt: string;
  icon?: string; // lucide icon name, resolved at render time
}

// ── Agent definition ──

export interface AgentPromptContext {
  /** Compact Career DNA summary from shared memory */
  careerDNA: string;
  /** Session memory digest (generated when ≥5 user messages) */
  memoryDigest?: string;
  /** Recent conversation messages */
  currentMessages: { role: string; content: string }[];
  /** Agent-specific knowledge injection text */
  agentKnowledge: string;
}

export interface AgentDefinition {
  /** Unique identifier, used as agent_id on messages */
  id: string;
  /** Chinese display name shown in agent tag UI */
  name: string;
  /** Short capability description */
  description: string;
  /** Regex patterns that trigger this agent */
  intentPatterns: RegExp[];
  /** Explicit switch phrases that bypass intent matching */
  explicitSwitchPatterns?: RegExp[];
  /** Build agent-specific system prompt (async — may fetch dingwei prompt, load CV, etc.) */
  buildSystemPrompt: (ctx: AgentPromptContext) => Promise<string>;
  /** Tools available to this agent */
  tools: ToolDefinition[];
  /** Knowledge domains to inject into this agent's prompt */
  knowledgeSubset?: KnowledgeDomain[];
  /** Routing priority — higher wins on tie */
  priority: number;
  /** Suggestion chips shown when this agent is active */
  suggestions: AgentSuggestion[];
  /** Optional model override */
  model?: string;
}
