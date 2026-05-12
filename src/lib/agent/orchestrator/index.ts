/**
 * Orchestrator — 意图路由编排器 (Generator-based)
 *
 * Core flow:
 * 1. classifyIntentLLM(content, agents) → IntentResult
 * 2. Load target agent, build system prompt from agent.md + context
 * 3. yield* agentLoopServer({ agent, systemPrompt, messages, tools })
 *
 * Falls back to regex intentPatterns when LLM classification fails.
 */

import { classifyIntent, getAllAgents, getAgentById } from "@/lib/agent/registry";
import { classifyIntentLLM, isValidAgent } from "@/lib/agent/classify-intent-llm";
// loadAgentMD imported dynamically to avoid bundling fs into client
import {
  getCareerDNASummary,
  getKnowledgeForAgent,
  getClaudeAgentActivity,
} from "@/lib/agent/shared-memory";
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import type { SSEEvent } from "@/lib/agent/loop/types";
import registry from "@/lib/agent/tools";
import { buildContext } from "@/lib/agent/memory/coordinator";

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

// ── Shared context building ──

async function buildAgentContext(
  agent: AgentDefinition,
  ctx: OrchestratorContext,
): Promise<AgentPromptContext> {
  const [careerDNA, agentKnowledge, claudeAgentActivity] = await Promise.all([
    getCareerDNASummary(),
    Promise.resolve(getKnowledgeForAgent(agent.knowledgeSubset || [])),
    getClaudeAgentActivity(),
  ]);

  const memCtx = await buildContext(ctx.sessionId, ctx.messages);
  const memoryDigest = ctx.memoryDigest || memCtx.summaryInjection || undefined;

  return {
    careerDNA,
    memoryDigest,
    currentMessages: memCtx.truncatedMessages,
    agentKnowledge,
    claudeAgentActivity: claudeAgentActivity || undefined,
  };
}

function buildSystemPrompt(
  soulBody: string,
  promptCtx: AgentPromptContext,
  memCtx: { semanticInjection?: string },
): string {
  let prompt = soulBody;

  // Inject dynamic context sections
  if (promptCtx.careerDNA) {
    prompt += `\n\n## 用户画像 (Career DNA)\n${promptCtx.careerDNA}`;
  }
  if (promptCtx.agentKnowledge) {
    prompt += `\n\n## 知识库\n${promptCtx.agentKnowledge}`;
  }
  if (promptCtx.memoryDigest) {
    prompt += `\n\n## 会话记忆\n${promptCtx.memoryDigest}`;
  }
  if (promptCtx.claudeAgentActivity) {
    prompt += `\n\n${promptCtx.claudeAgentActivity}`;
  }
  if (memCtx.semanticInjection) {
    prompt += `\n${memCtx.semanticInjection}`;
  }

  return prompt;
}

// ── Main: Generator-based orchestrator ──

/**
 * Orchestrate: classify → delegate to sub-agent loop.
 *
 * Use with `for await (const event of orchestrate(content, ctx))` for SSE streaming.
 */
export async function* orchestrateGen(
  content: string,
  ctx: OrchestratorContext,
): AsyncGenerator<SSEEvent & { agentId?: string; agentName?: string; modelTier?: string }> {
  // Phase 1: Intent classification
  yield { type: "phase", phase: "understanding" };

  const agents = getAllAgents().filter((a) => a.id !== "orchestrator");
  let targetAgentId = "general";
  let modelTier: "default" | "pro" = "default";

  // LLM classification with regex fallback
  const llmIntent = await classifyIntentLLM(content, agents);
  if (llmIntent && isValidAgent(llmIntent.agentId, agents)) {
    targetAgentId = llmIntent.agentId;
    modelTier = llmIntent.modelTier || "default";
    yield { type: "intent", agentId: targetAgentId, reason: llmIntent.reason, modelTier };
  } else {
    // Fallback: regex classification
    const fallbackAgent = classifyIntent(content);
    targetAgentId = fallbackAgent.id;
    yield { type: "intent", agentId: targetAgentId, reason: "正则分类 (LLM 不可用)", modelTier };
  }

  // Phase 2: Load target agent
  const agent = getAgentById(targetAgentId);
  if (!agent) {
    yield { type: "done" };
    return;
  }

  yield { type: "agent_switch", agentId: agent.id, agentName: agent.name };

  // Phase 3: Build system prompt (agent.md + context)
  const [soul, promptCtx] = await Promise.all([
    loadAgentMDSafe(agent.id),
    buildAgentContext(agent, ctx),
  ]);

  const memCtx = await buildContext(ctx.sessionId, ctx.messages);
  const systemPrompt = buildSystemPrompt(soul.body, promptCtx, memCtx);

  // Phase 4: Select model based on tier
  const effectiveModel = modelTier === "pro" && agent.modelPro
    ? agent.modelPro
    : agent.model;

  // Temporarily set model on the agent for the loop
  const agentWithModel = { ...agent, model: effectiveModel };

  // Phase 5: Build tools array
  const toolNames = agent.toolNames?.length
    ? agent.toolNames
    : agent.tools.map((t) => t.name);
  const allTools = registry.toOpenAITools();
  const tools = allTools.filter((t) => toolNames.includes(t.function.name));

  // Phase 6: Delegate to agent loop
  // Dynamic import to avoid circular deps
  const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
  yield* agentLoopServer({
    agent: agentWithModel,
    systemPrompt,
    messages: ctx.messages,
    tools,
  });
}

/** Safe wrapper: dynamic import to avoid fs in client bundle */
async function loadAgentMDSafe(agentId: string) {
  try {
    const { loadAgentMD } = await import("@/lib/agent/load-agent-md");
    return loadAgentMD(agentId);
  } catch {
    console.warn(`[orchestrator] agent.md load failed for "${agentId}", using fallback`);
    const { loadAgentMD } = await import("@/lib/agent/load-agent-md");
    return loadAgentMD("general");
  }
}

// ── Legacy: Promise-based API for backward compatibility ──

/**
 * Orchestrate via server-side APIs (classify + soul).
 * Client-safe: no fs, no process.env needed.
 */
export async function orchestrate(
  content: string,
  ctx: OrchestratorContext,
): Promise<OrchestratorResult> {
  // 1. Classify intent via server API (LLM with full message history)
  let agentId = "general";
  try {
    const classifyRes = await fetch("/api/agent/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: ctx.messages }),
    });
    if (classifyRes.ok) {
      const json = await classifyRes.json();
      if (json.success) agentId = json.data.agentId;
    }
  } catch {
    // Fall back to regex on network error
    agentId = classifyIntent(content).id;
  }

  // 2. Load agent definition
  const agent = getAgentById(agentId) || getAgentById("general")!;

  // 3. Load system prompt via soul API
  let systemPrompt = `你是纸鸢的 ${agent.name} 助手。`;
  try {
    const soulRes = await fetch(`/api/agent/soul?agent=${agent.id}`);
    if (soulRes.ok) {
      const json = await soulRes.json();
      if (json.success) systemPrompt = json.data.body;
    }
  } catch { /* use fallback */ }

  // 4. Build tools
  const toolNames = agent.toolNames?.length
    ? agent.toolNames
    : agent.tools.map((t) => t.name);
  const allTools = registry.toOpenAITools();
  const tools = allTools.filter((t) => toolNames.includes(t.function.name));

  return {
    agent,
    systemPrompt,
    toolWhitelist: toolNames,
    tools,
    annotatedMessages: ctx.messages,
  };
}
