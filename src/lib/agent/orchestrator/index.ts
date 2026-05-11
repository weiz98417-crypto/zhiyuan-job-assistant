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
  getKnowledgeForAgent,
  getClaudeAgentActivity,
} from "@/lib/agent/shared-memory";
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import registry from "@/lib/agent/tools";
import { buildContext } from "@/lib/agent/memory/coordinator";

/** Read CV summary from localStorage (where CV editor saves) */
function getCVSummary(): string {
  try {
    const raw = localStorage.getItem("zhiyuan-cv");
    if (!raw) return "";
    const cv = JSON.parse(raw);
    if (!cv?.activeVersion || !cv?.versions?.[cv.activeVersion]?.sections) return "";
    const sections = cv.versions[cv.activeVersion].sections as Array<{ title: string; content: string }>;
    return sections
      .filter((s) => s.content?.trim())
      .map((s) => `【${s.title}】${s.content.trim()}`)
      .join("\n");
  } catch { return ""; }
}

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
  tools: Array<{ type: string; function: object }>;
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

  // 2. Build shared context — server-side sources of truth
  const [careerDNA, cvSummary, agentKnowledge, claudeAgentActivity] = await Promise.all([
    getCareerDNASummary(),
    getCVSummary(),
    Promise.resolve(getKnowledgeForAgent(agent.knowledgeSubset || [])),
    getClaudeAgentActivity(),
  ]);

  // 2.5 Build layered memory context
  const memCtx = await buildContext(ctx.sessionId, ctx.messages);
  const memoryDigest = ctx.memoryDigest || memCtx.summaryInjection || undefined;

  // 3. Build agent-specific system prompt
  const promptCtx: AgentPromptContext = {
    careerDNA: careerDNA + (cvSummary ? `\n\n【用户简历】\n${cvSummary}` : ""),
    memoryDigest,
    currentMessages: memCtx.truncatedMessages,
    agentKnowledge,
    claudeAgentActivity: claudeAgentActivity || undefined,
  };

  let systemPrompt = await agent.buildSystemPrompt(promptCtx);

  // Inject semantic memory if available
  if (memCtx.semanticInjection) {
    systemPrompt += `\n${memCtx.semanticInjection}`;
  }

  // 4. Generate tool whitelist — resolve from toolNames if tools not populated yet
  const toolNames = agent.tools.length > 0
    ? agent.tools.map((t) => t.name)
    : (agent.toolNames?.length ? agent.toolNames : registry.getAll().map((t) => t.name));
  const toolWhitelist = toolNames;

  // 5. Generate OpenAI-compatible tools array filtered to active agent
  const allTools = registry.toOpenAITools();
  const tools = allTools.filter((t) => toolWhitelist.includes(t.function.name));

  // 6. Messages are annotated as-is (agent_id tagging happens on save)
  return {
    agent,
    systemPrompt,
    toolWhitelist,
    tools,
    annotatedMessages: ctx.messages,
  };
}
