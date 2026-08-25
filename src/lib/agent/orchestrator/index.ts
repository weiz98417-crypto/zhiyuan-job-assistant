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
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import type { SSEEvent } from "@/lib/agent/loop/types";
import registry from "@/lib/agent/tools";
import { resolveImageIntakeAgentId, type ImageDocumentType, type ImageIntakeResult } from "@/lib/agent/image-intake";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import type { AgentTaskContract } from "@/lib/agent/task-contract";
import { injectKnowledge, type AgentScenario } from "@/lib/agent/knowledge";
import type { ModelRecoveryPolicy } from "@/lib/agent/loop/types";

// ── Types ──

export interface OrchestratorContext {
  sessionId: number | null;
  messages: { role: string; content: string; images?: string[] }[];
  memoryDigest?: string;
  signal?: AbortSignal;
  forcedAgentId?: string;
  agentState?: Record<string, unknown>;
  imageIntake?: ImageIntakeResult | null;
  preferredDocumentType?: ImageDocumentType;
  principal?: ExecutionPrincipal;
  runId?: string;
  workerId?: string;
  fencingToken?: number;
  taskContract?: AgentTaskContract | null;
  durable?: boolean;
  modelRecovery?: ModelRecoveryPolicy;
}

export interface OrchestratorResult {
  agent: AgentDefinition;
  systemPrompt: string;
  toolWhitelist: string[];
  tools: Array<{ type: string; function: object }>;
  annotatedMessages: { role: string; content: string }[];
}

function resolveAgentFromImageIntake(
  userText: string,
  intake?: ImageIntakeResult | null,
  preferredDocumentType?: ImageDocumentType,
): string | undefined {
  return resolveImageIntakeAgentId(userText, intake, preferredDocumentType);
}

// ── Shared context building ──

async function buildAgentContext(
  agent: AgentDefinition,
  ctx: OrchestratorContext,
): Promise<AgentPromptContext> {
  if (ctx.durable && ctx.principal) {
    const { getAgentReadService } = await import("@/lib/agent/runtime/agent-read-service");
    const profile = await getAgentReadService().getProfile(ctx.principal).catch(() => null);
    return {
      careerDNA: profile ? durableProfileSummary(profile) : "",
      memoryDigest: ctx.memoryDigest,
      agentStateInjection: ctx.agentState ? JSON.stringify(ctx.agentState, null, 2) : undefined,
      currentMessages: ctx.messages,
      agentKnowledge: durableKnowledgeForAgent(agent.knowledgeSubset || []),
    };
  }
  const {
    getCareerDNASummary,
    getKnowledgeForAgent,
    getClaudeAgentActivity,
  } = await import("@/lib/agent/shared-memory");
  const { buildContext } = await import("@/lib/agent/memory/coordinator");
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
    agentStateInjection: ctx.agentState ? JSON.stringify(ctx.agentState, null, 2) : undefined,
    currentMessages: memCtx.truncatedMessages,
    agentKnowledge,
    claudeAgentActivity: claudeAgentActivity || undefined,
  };
}

function buildSystemPrompt(
  soulBody: string,
  promptCtx: AgentPromptContext,
  memCtx: { semanticInjection?: string; agentStateInjection?: string },
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
  if (promptCtx.agentStateInjection) {
    prompt += `\n\n## 会话状态\n${promptCtx.agentStateInjection}`;
  }
  if (promptCtx.claudeAgentActivity) {
    prompt += `\n\n${promptCtx.claudeAgentActivity}`;
  }
  if (memCtx.semanticInjection) {
    prompt += `\n${memCtx.semanticInjection}`;
  }
  if (memCtx.agentStateInjection) {
    prompt += `\n\n${memCtx.agentStateInjection}`;
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

  if (ctx.forcedAgentId && isValidAgent(ctx.forcedAgentId, agents)) {
    targetAgentId = ctx.forcedAgentId;
    yield { type: "intent", agentId: targetAgentId, reason: "Run 已锁定 Agent", modelTier };
  } else {
    const llmIntent = await classifyIntentLLM(content, agents);
    if (llmIntent && isValidAgent(llmIntent.agentId, agents)) {
      targetAgentId = llmIntent.agentId;
      modelTier = llmIntent.modelTier || "default";
      yield { type: "intent", agentId: targetAgentId, reason: llmIntent.reason, modelTier };
    } else {
      const fallbackAgent = classifyIntent(content);
      targetAgentId = fallbackAgent.id;
      yield { type: "intent", agentId: targetAgentId, reason: "正则分类 (LLM 不可用)", modelTier };
    }
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

  const memCtx = ctx.durable
    ? { semanticInjection: "", agentStateInjection: "" }
    : await (await import("@/lib/agent/memory/coordinator")).buildContext(ctx.sessionId, ctx.messages);
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
  const allTools = registry.toOpenAITools(toolNames, ctx.durable === true);
  const tools = allTools.filter((t) => toolNames.includes(t.function.name));

  // Phase 6: Delegate to agent loop
  // Dynamic import to avoid circular deps
  const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
  yield* agentLoopServer({
    agent: agentWithModel,
    systemPrompt,
    messages: ctx.messages,
    tools,
    signal: ctx.signal,
    taskContract: ctx.taskContract,
    modelRecovery: ctx.modelRecovery,
    executionContext: ctx.principal && ctx.runId
      ? {
          principal: ctx.principal,
          runId: ctx.runId,
          allowlist: toolNames,
          signal: ctx.signal,
          workerId: ctx.workerId,
          fencingToken: ctx.fencingToken,
        }
      : undefined,
  });
}

function durableProfileSummary(profile: {
  data: Record<string, unknown>;
  goals: Record<string, unknown>;
  history: unknown[];
  lastUpdated: string;
}): string {
  return JSON.stringify({
    data: profile.data,
    goals: profile.goals,
    recentHistory: profile.history.slice(-5),
    lastUpdated: profile.lastUpdated,
  }).slice(0, 4_000);
}

function durableKnowledgeForAgent(domains: AgentDefinition["knowledgeSubset"]): string {
  const scenarios: Partial<Record<string, AgentScenario>> = {
    "interview-styles": "interview_prep",
    "salary-benchmarks": "evaluate",
    "zhiyuan-levels": "dingwei",
    "jd-signals": "evaluate",
  };
  const selected = new Set<AgentScenario>();
  for (const domain of domains || []) {
    const scenario = scenarios[domain];
    if (scenario) selected.add(scenario);
  }
  return Array.from(selected).map((scenario) => injectKnowledge(scenario)).filter(Boolean).join("\n\n");
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
  const imageAgentId = resolveAgentFromImageIntake(content, ctx.imageIntake, ctx.preferredDocumentType);
  let agentId = ctx.forcedAgentId || imageAgentId || "general";
  if (!ctx.forcedAgentId && !imageAgentId) {
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
