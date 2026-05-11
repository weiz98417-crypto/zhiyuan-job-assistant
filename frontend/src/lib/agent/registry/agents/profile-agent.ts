/**
 * Profile Agent — 求职画像子代理
 *
 * Handles self-positioning (dingwei), skill analysis, and career direction.
 * Uses mine_profile tool for SOP-driven dingwei conversations.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";

// ── Dingwei SOP prompt (lazy-loaded from API) ──
let cachedDingweiPrompt: string | null = null;

async function fetchDingweiPrompt(): Promise<string> {
  if (cachedDingweiPrompt) return cachedDingweiPrompt;
  try {
    const res = await fetch("/api/agent/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "dingwei" }),
    });
    if (res.ok) {
      const data = await res.json();
      cachedDingweiPrompt = data.systemPrompt || "";
    }
  } catch {
    // Silently fall back to built-in prompt
  }
  return cachedDingweiPrompt || "";
}

// ── Built-in dingwei prompt (fallback when API unavailable) ──

const BUILTIN_DINGWEI_PROMPT = `## 自我定位模式

当用户说"帮我做自我定位"、"帮我定位"、"我不知道自己适合什么"、"我不清楚自己的方向"时，进入此模式。

### 核心原则
1. 跟能量走，不跟脚本走 — 用户说到什么眼睛亮了，往那深挖
2. 追问 > 新问题 — "能举个具体例子吗？"比"下一个问题是..."有用十倍
3. 用户自己总结 > 你替总结 — 收尾时让用户说"我清楚了..."
4. 检测限幅信念 — "我不行""太晚了"→ 先拆墙再探路
5. 诚实 > 讨好 — 聊了10轮没突破，可以说"今天至少排除了X和Y"

### 对话节奏
- 阶段1 设定期望（1-2轮）
- 阶段2 判状态（1轮）：A.已在找工作 B.还没想清楚 C.应届生
- 阶段3 深挖（5-8轮）
- 阶段4 收尾（2-3轮）→ 调用 mine_profile → 展示画像

### 问题工具箱
深挖: 心流探测/峰值回忆/外部视角/反向排除/隐喻打开
追问: 模糊→要例子 / 消极→外部视角 / 矛盾→排优先级
限幅信念重构: "我找不到"→没有唯一正确的工作 / "太晚了"→经历不是包袱

### 反模式
- 替用户总结优势
- 连续问3+问题不等深入回答
- 跳过限幅信念不处理
- 给建议而不是提问题`;

// ── Tools description ──

const PROFILE_TOOLS_DESC = `
## 可用工具

- mine_profile: 对话式画像挖掘工具，记录定位对话中的关键信号 (action: start/answer/stage_prompt/complete/reset, answer?: 用户回答文本)
- get_profile: 读取当前求职画像数据
- get_recommendations: 基于画像推荐适合的岗位方向
`;

// ── Suggestions ──

const PROFILE_SUGGESTIONS = [
  { label: "自我定位", prompt: "帮我做自我定位" },
  { label: "分析竞争力", prompt: "帮我分析一下我的竞争力" },
  { label: "推荐方向", prompt: "根据我的经历推荐几个适合的方向" },
];

// ── Intent patterns ──

const PROFILE_INTENT_PATTERNS = [
  /自我定位/,
  /帮我定位/,
  /找.*方向/,
  /适合.*什么/,
  /我.*能做什么/,
  /分析.*(竞争力|优势|弱项)/,
  /我.*(适合|匹配).*岗位/,
  /(帮我|请).*(分析|看看).*(画像|profile|优势|短板)/,
  /职业.*(规划|方向|路径)/,
];

// ── Agent definition ──

export const profileAgent: AgentDefinition = {
  id: "profile",
  name: "求职画像",
  description: "自我定位、竞争力分析、职业方向探索",
  intentPatterns: PROFILE_INTENT_PATTERNS,
  explicitSwitchPatterns: [/用画像模式/, /帮我定位/, /自我定位/],
  tools: [], // Populated via populateAgentTools()
  toolNames: ["get_profile", "get_recommendations", "get_profile_insights", "self_positioning", "check_pipeline_health", "get_recent_activity", "mine_profile"],
  knowledgeSubset: ["zhiyuan-levels", "salary-benchmarks"],
  priority: 10,
  suggestions: PROFILE_SUGGESTIONS,

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    // Fetch dingwei SOP prompt from API (cached)
    const dingweiPrompt = (await fetchDingweiPrompt()) || BUILTIN_DINGWEI_PROMPT;

    return `你是纸鸢的求职画像子代理。你的任务：帮助用户探索职业方向、分析竞争力、生成求职画像。

${dingweiPrompt}

## 用户画像 (Career DNA)
${ctx.careerDNA || "暂无画像数据"}

${ctx.agentKnowledge ? `## 行业知识\n${ctx.agentKnowledge}` : ""}

${ctx.memoryDigest ? `## 会话记忆\n${ctx.memoryDigest}` : ""}

${PROFILE_TOOLS_DESC}

## 核心规则
- 仅使用 mine_profile、get_profile、get_recommendations 三个工具
- 定位对话每次只问一个问题，等待用户深入回答
- 对话结束后调用 mine_profile(action="complete") 写入画像
- 禁止 web_search，禁止推荐具体JD`;
  },
};

export default profileAgent;
