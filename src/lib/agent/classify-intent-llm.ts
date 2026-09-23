/**
 * classifyIntentLLM — LLM 驱动的意图分类器
 *
 * 替换原有的正则 intentPatterns 匹配，使用 DeepSeek V4 Flash 做 JSON 分类。
 * 超时 → 降级到正则 fallback。模型调用统一走 ModelGateway。
 */

import type { AgentDefinition } from "./registry/types";
import { complete, getThinkModelChain } from "@/lib/ai/model-gateway";

// ── 分类器短链（flash 优先，zhipu 兜底）──
const CLASSIFIER_CHAIN = getThinkModelChain();

export interface IntentResult {
  agentId: string;
  reason: string;
  modelTier?: "default" | "pro";
}

export function classifyIntentHardRule(content: string): IntentResult | null {
  const text = content.trim();
  if (!text) return null;

  const isEvaluation =
    /(评估|分析|看看|看一下|打分|匹配).{0,16}(JD|jd|职位|岗位|这个|这份|链接)/i.test(text) ||
    /\bJD\b.{0,16}(评估|分析|打分|匹配)/i.test(text);
  const isJobDiscovery =
    /(岗位发现|职位搜索|找岗位|找职位|搜岗位|搜职位|搜索岗位|搜索职位|推荐岗位|推荐职位|扫一批\s*JD|扫描\s*JD)/i.test(text) ||
    /(找|搜|搜索|推荐|发现|扫描|扫).{0,20}(岗位|职位|工作|JD|jd|招聘|机会)/i.test(text) ||
    /(岗位|职位|工作|JD|jd|招聘|机会).{0,20}(找|搜|搜索|推荐|发现|扫描|扫)/i.test(text);

  if (isJobDiscovery && !isEvaluation) {
    return {
      agentId: "general",
      reason: "用户在请求职位搜索/岗位发现，应进入通用 Agent 并使用岗位发现工具，而不是 JD 评估。",
      modelTier: detectModelTier(content),
    };
  }

  return null;
}

/** 基于用户措辞判断是否需要 Pro */
function detectModelTier(content: string): "default" | "pro" {
  if (/深度|精修|仔细|详细|认真|最好|高质量|专业|精品/.test(content)) return "pro";
  return "default";
}

/** 构造分类 prompt */
function buildClassifierPrompt(agents: AgentDefinition[], content: string): string {
  const agentList = agents
    .filter((a) => a.id !== "general") // general 不在列表中，由 fallback 处理
    .map((a) => `- ${a.id}: ${a.description}`)
    .join("\n");

  return `你是意图路由器。把用户消息分类到正确的 agent。只输出 JSON。

## Agent 列表
${agentList}
- general: 以上都不匹配时

## 分类规则
- 用户说"评估JD""分析职位""看看岗位"→ evaluate（即使还没发JD内容！evaluate agent自己会问）
- 用户说"我的简历""改简历""看简历""查看简历""优化CV""生成简历""导出简历"→ resume
- 用户说"面试""模拟"→ interview
- 用户说"定位""画像""方向"→ profile
- 其他 → general

## 用户消息
"${content}"

输出（仅JSON，不要有任何其他字符）：`;
}

/** 调用 LLM 分类（每模型 8 秒超时，失败即换下一个，与旧实现一致） */
async function callClassifier(prompt: string): Promise<string> {
  const result = await complete({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    maxTokens: 1024, // enough for reasoning + JSON answer
    stream: false,
    chain: CLASSIFIER_CHAIN,
    timeoutMs: 8_000,
  });
  const text = result.text;
  if (!text) throw new Error("Classifier returned empty content");
  return text;
}

/** 解析 LLM 输出为 IntentResult */
function parseIntent(raw: string): IntentResult | null {
  try {
    // 提取第一个 JSON 对象
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const agentId = parsed.agentId || parsed.agent; // accept both formats
    if (agentId && typeof agentId === "string") {
      return {
        agentId,
        reason: parsed.reason || "",
        modelTier: parsed.modelTier as "default" | "pro" | undefined,
      };
    }
  } catch { /* parse failed */ }
  return null;
}

/**
 * LLM 意图分类
 * @param content 用户消息
 * @param agents 已注册的 agent 列表
 * @returns IntentResult 或 null（分类失败，需降级）
 */
export async function classifyIntentLLM(
  content: string,
  agents: AgentDefinition[],
  historyContext?: string,
): Promise<IntentResult | null> {
  const hardRule = classifyIntentHardRule(content);
  if (hardRule) return hardRule;

  const prompt = historyContext
    ? buildClassifierPromptWithHistory(agents, content, historyContext)
    : buildClassifierPrompt(agents, content);
  const modelTier = detectModelTier(content);

  try {
    const raw = await callClassifier(prompt);
    const intent = parseIntent(raw);
    if (intent) {
      // 如果 LLM 没有返回 modelTier，用本地检测的
      if (!intent.modelTier) intent.modelTier = modelTier;
      return intent;
    }
  } catch (err) {
    console.warn("[intent-classifier] LLM classification failed:", err instanceof Error ? err.message : String(err), "→ fallback to regex");
  }

  return null; // 降级信号
}

/** 检查 agentId 是否有效 */
export function isValidAgent(agentId: string, agents: AgentDefinition[]): boolean {
  return agents.some((a) => a.id === agentId);
}

/** 构造带历史上下文的分类 prompt */
function buildClassifierPromptWithHistory(
  agents: AgentDefinition[],
  content: string,
  historyContext: string,
): string {
  const agentList = agents
    .filter((a) => a.id !== "general")
    .map((a) => `- ${a.id}: ${a.description}`)
    .join("\n");

  return `你是意图路由器。根据完整上下文分类用户意图。

## 历史上下文
${historyContext}

## 最新用户消息
"${content}"

## Agent 列表
${agentList}
- general: 以上都不匹配时

## 分类规则
- 提到"评估""分析""看看"+ "JD/职位/岗位/这个" → evaluate（用户说"评估这个"而上文有JD → evaluate）
- 提到"我的简历""看简历""查看简历""简历""CV""优化""修改""导出" → resume
- 提到"面试""模拟""准备" → interview
- 提到"定位""画像""方向""适合" → profile
- 其他 → general

输出仅 JSON（不要有其他字符）：{"agentId": "...", "reason": "一句话中文"}`;
}

export { buildClassifierPrompt, detectModelTier, CLASSIFIER_CHAIN };
