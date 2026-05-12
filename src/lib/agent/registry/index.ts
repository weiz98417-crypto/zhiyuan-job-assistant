/**
 * Agent Registry — 集中管理所有子 Agent 的定义
 *
 * - classifyIntent(): 意图分类 + 路由
 * - getAllAgents(): 列出所有注册的 Agent
 * - getAgentById(): 按 ID 查找
 *
 * Registration order = tie-breaking order (when priority is equal).
 */
import type { AgentDefinition } from "./types";
import { interviewAgent } from "./agents/interview-agent";
import { evaluateAgent } from "./agents/evaluate-agent";
import { profileAgent } from "./agents/profile-agent";
import { resumeAgent } from "./agents/resume-agent";
import { orchestratorAgent } from "./agents/orchestrator/index";
import { generalAgent } from "./agents/general-agent";
// ── Static registry (registration order = tie-break order) ──

const AGENT_REGISTRY: AgentDefinition[] = [
  orchestratorAgent, // System agent — not matched by regex (no intentPatterns)
  interviewAgent,
  evaluateAgent,
  profileAgent,
  resumeAgent,
  generalAgent, // Must be last — catch-all fallback
];

// ── Public API ──

/**
 * Classify user intent and return the best matching agent.
 *
 * Precedence:
 * 1. explicitSwitchPatterns (user explicitly specifies agent)
 * 2. intentPatterns, sorted by priority (registration order breaks ties)
 * 3. generalAgent (catch-all)
 */
export function classifyIntent(content: string): AgentDefinition {
  if (!content || !content.trim()) return generalAgent;

  // 1. Check explicit switch phrases first
  for (const agent of AGENT_REGISTRY) {
    if (agent.explicitSwitchPatterns?.some((p) => p.test(content))) {
      return agent;
    }
  }

  // 2. Match intent patterns by priority
  const matches = AGENT_REGISTRY.filter((a) =>
    a.intentPatterns.some((p) => p.test(content)),
  ).sort((a, b) => b.priority - a.priority);

  if (matches.length > 0) return matches[0];

  // 3. Fallback to general
  return generalAgent;
}

/** Get all registered agents */
export function getAllAgents(): AgentDefinition[] {
  return [...AGENT_REGISTRY];
}

/** Look up an agent by id */
export function getAgentById(id: string): AgentDefinition | undefined {
  return AGENT_REGISTRY.find((a) => a.id === id);
}
