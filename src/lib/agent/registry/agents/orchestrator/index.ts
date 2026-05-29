/**
 * Orchestrator Agent — 意图路由器
 *
 * System agent: not shown in UI, not selectable by users.
 * Only used internally by the orchestrator for intent classification.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import { loadAgentMD } from "@/lib/agent/load-agent-md";

export const orchestratorAgent: AgentDefinition = {
  id: "orchestrator",
  name: "路由器",
  description: "理解意图 → 分类 → 委托给正确的 sub-agent",
  intentPatterns: [], // Never matched — orchestrator is invoked directly
  tools: [], // No tools — classification only
  toolNames: [],
  priority: 99, // Highest, but not used because orchestrator doesn't participate in regex matching
  suggestions: [],
  model: "deepseek-v4-flash",

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    const soul = await loadAgentMD("orchestrator");
    return soul.body;
  },
};

export default orchestratorAgent;
