/**
 * classifyIntentLLM — LLM 驱动的意图分类器
 *
 * 替换原有的正则 intentPatterns 匹配，使用 DeepSeek V4 Flash 做 JSON 分类。
 * 3 秒超时 → 降级到正则 fallback。
 */

import type { AgentDefinition } from "./registry/types";
import { ZHIPU_API_URL, ZHIPU_FALLBACK_MODEL } from "@/lib/zhipu";

// ── MODEL_CHAIN（与 server-runner.ts 同步）──

const MODEL_CHAIN = [
  { model: "deepseek-v4-flash", url: "https://api.deepseek.com/chat/completions", keyEnv: "DEEPSEEK_API_KEY" },
  { model: ZHIPU_FALLBACK_MODEL, url: ZHIPU_API_URL, keyEnv: "ZHIPU_API_KEY" },
];

export interface IntentResult {
  agentId: string;
  reason: string;
  modelTier?: "default" | "pro";
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

/** 调用 LLM 分类，带 3 秒超时 */
async function callClassifier(prompt: string): Promise<string> {
  for (const { model, url, keyEnv } of MODEL_CHAIN) {
    const apiKey = process.env[keyEnv];
    if (!apiKey) continue;

    const controller = new AbortController();
    const timeout = setTimeout(() => { console.log("[classifier] timeout for", model); controller.abort(); }, 8000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1024, // enough for reasoning + JSON answer
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn("[classifier]", model, "HTTP", res.status);
        continue;
      }

      const json = await res.json();
      const msg = json.choices?.[0]?.message;
      const text = (msg?.content || msg?.reasoning_content || "").trim();
      if (text) return text;
    } catch {
      // Timeout or network error → try next model
    } finally {
      clearTimeout(timeout);
    }
  }

  console.warn("[classifier] all models failed for intent classification");
  throw new Error("All classifier models failed");
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

export { buildClassifierPrompt, detectModelTier, MODEL_CHAIN };
