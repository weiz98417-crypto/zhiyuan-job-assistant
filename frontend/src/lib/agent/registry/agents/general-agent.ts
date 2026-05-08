/**
 * General Agent — 通用助手（兜底 Agent）
 *
 * Catch-all agent for career questions, status queries, and casual chat.
 * Has access to ALL tools and ALL knowledge domains.
 * IntentPatterns includes the catch-all pattern so it always matches as fallback.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import { buildAgentSystemPrompt } from "@/lib/agent/prompt";
import { buildToolListForLLM } from "@/lib/agent/tools";

// ── Default suggestions (migrated from SuggestionChips.tsx) ──

export const DEFAULT_SUGGESTIONS = [
  { label: "自我定位", prompt: "帮我做自我定位" },
  { label: "评估JD", prompt: "帮我评估一个JD: " },
  { label: "生成简历", prompt: "根据我的画像生成一份简历" },
  { label: "推荐岗位", prompt: "根据我的画像推荐几个适合的岗位" },
  { label: "查投递", prompt: "帮我查一下最近的投递记录" },
  { label: "模拟面试", prompt: "帮我做一次模拟面试练习" },
  { label: "导出报告", prompt: "帮我生成一份求职进展报告并导出" },
];

// ── Agent definition ──

export const generalAgent: AgentDefinition = {
  id: "general",
  name: "通用助手",
  description: "求职咨询、状态查询、岗位推荐、简历建议",
  intentPatterns: [/.*/], // Catch-all — always matches
  tools: [], // Populated at registration time with ALL tools
  knowledgeSubset: ["salary-benchmarks", "zhiyuan-levels", "interview-styles", "jd-signals"],
  priority: 1, // Lowest — only matches when no other agent does
  suggestions: DEFAULT_SUGGESTIONS,

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    // Use existing prompt builder + inject career DNA and knowledge
    const basePrompt = buildAgentSystemPrompt();

    return `${basePrompt}

## 用户画像 (Career DNA)
${ctx.careerDNA || "暂无画像数据"}

${ctx.agentKnowledge ? `## 知识库\n${ctx.agentKnowledge}` : ""}

${ctx.memoryDigest ? `## 会话记忆\n${ctx.memoryDigest}` : ""}`;
  },
};

export default generalAgent;
