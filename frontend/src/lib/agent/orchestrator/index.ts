/**
 * Orchestrator — 意图路由编排器
 *
 * Core flow:
 * 1. classifyIntent(content) → AgentDefinition
 * 2. Get shared context (Career DNA + memory digest + knowledge)
 * 3. agent.buildSystemPrompt(ctx) → final system prompt
 * 4. Generate toolWhitelist from agent.tools
 * 5. Set active agent tools on registry
 * 6. Return everything needed to run agentLoopClient
 */
import { classifyIntent } from "@/lib/agent/registry";
import {
  getCareerDNASummary,
  getSessionContext,
  getKnowledgeForAgent,
} from "@/lib/agent/shared-memory";
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";

// ── Types ──

export interface OrchestratorContext {
  sessionId: number | null;
  messages: { role: string; content: string }[];
  memoryDigest?: string;
}

export interface OrchestratorResult {
  agent: AgentDefinition;
  systemPrompt: string;
  toolWhitelist: string[];
  annotatedMessages: { role: string; content: string }[];
}

// ── Main orchestrate function ──

/**
 * Orchestrate a user message to the correct sub-agent.
 *
 * The caller is responsible for:
 * - Calling agentLoopClient with the returned systemPrompt and messages
 * - Tagging new messages with agent.id
 * - Updating UI activeAgent state
 */
export async function orchestrate(
  content: string,
  ctx: OrchestratorContext,
): Promise<OrchestratorResult> {
  // 1. Intent classification
  const agent = classifyIntent(content);

  // 2. Build shared context
  const [careerDNA, agentKnowledge] = await Promise.all([
    getCareerDNASummary(),
    Promise.resolve(getKnowledgeForAgent(agent.knowledgeSubset || [])),
  ]);

  const memoryDigest =
    ctx.memoryDigest || getSessionContext(ctx.messages) || undefined;

  // 3. Build agent-specific system prompt
  const promptCtx: AgentPromptContext = {
    careerDNA,
    memoryDigest,
    currentMessages: ctx.messages,
    agentKnowledge,
  };

  const systemPrompt = await agent.buildSystemPrompt(promptCtx);

  // 4. Generate tool whitelist
  const toolWhitelist = agent.tools.map((t) => t.name);

  // 5. Messages are annotated as-is (agent_id tagging happens on save)
  return {
    agent,
    systemPrompt,
    toolWhitelist,
    annotatedMessages: ctx.messages,
  };
}
