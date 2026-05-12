/**
 * Server-side Agent ReAct Loop
 *
 * Runs inside /api/agent/run. Directly calls DeepSeek API (API key on server)
 * and executes tools via registry.execute() (no fetch proxy).
 *
 * Quality-gated loop logic ported from client-runner.ts.
 */
import type { LoopConfig, LoopState, SSEEvent, AgentPhase } from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";
import { executeTool, formatToolResult } from "@/lib/agent/tools";
import type { ToolResult } from "@/lib/agent/tools/types";
import type { AgentDefinition } from "@/lib/agent/registry/types";

/* ── Quality check ── */

type ResultQuality = "good" | "empty" | "irrelevant";

function checkResultQuality(formatted: string): ResultQuality {
  const trimmed = formatted.trim();
  if (!trimmed || trimmed === "未找到相关结果" || trimmed === "搜索失败: 未找到相关结果") {
    return "empty";
  }
  // Detect obviously irrelevant Wikipedia results (e.g., TV dramas for company queries)
  const garbagePatterns = [
    /被惡魔附身/,
    /理想之城/,
    /電視劇/,
    /动漫/,
    /游戏/,
    /小说/,
    /連載/,
  ];
  if (garbagePatterns.some((p) => p.test(trimmed))) {
    return "irrelevant";
  }
  return "good";
}

/* ── LLM API with fallback ── */

const MODEL_CHAIN = [
  { model: "deepseek-v4-flash", url: "https://api.deepseek.com/chat/completions", keyEnv: "DEEPSEEK_API_KEY" },
  { model: "deepseek-v4-pro", url: "https://api.deepseek.com/chat/completions", keyEnv: "DEEPSEEK_API_KEY" },
  { model: "glm-4.6v-flashx", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", keyEnv: "ZHIPU_API_KEY" },
  { model: "qwen-long", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", keyEnv: "DASHSCOPE_API_KEY" },
];

interface DeepSeekMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface NativeToolCall {
  id: string;
  name: string;
  arguments: string;
}

async function callLLM(
  messages: DeepSeekMessage[],
  systemPrompt: string,
  tools?: Array<{ type: string; function: object }>,
  modelPreference?: string,
): Promise<{ text: string; toolCalls: NativeToolCall[] }> {
  let lastError = "";
  // If model preferred, reorder chain to put it first
  const chain = modelPreference
    ? [...MODEL_CHAIN].sort((a) => a.model === modelPreference ? -1 : 1)
    : MODEL_CHAIN;
  for (const { model, url, keyEnv } of chain) {
    const apiKey = process.env[keyEnv];
    if (!apiKey) continue;

    const body: Record<string, unknown> = {
      model,
      messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), ...messages],
      temperature: 0.7,
      max_tokens: 16384,
      stream: true,
    };
    if (tools?.length) body.tools = tools;

    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (response.ok) break;
      lastError = `${model} ${response.status}`;
      if (response.status !== 429 && response.status !== 503) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!response?.ok) continue;

    // Parse streaming response (same logic as before)

  // Parse streaming response
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  const toolCallFragments = new Map<number, { id: string; name: string; arguments: string }>();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) fullText += delta.content;
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallFragments.has(idx)) {
              toolCallFragments.set(idx, { id: "", name: "", arguments: "" });
            }
            const frag = toolCallFragments.get(idx)!;
            if (tc.id) frag.id = tc.id;
            if (tc.function?.name) frag.name += tc.function.name;
            if (tc.function?.arguments) frag.arguments += tc.function.arguments;
          }
        }
      } catch { /* skip */ }
    }
  }

  return { text: fullText, toolCalls: Array.from(toolCallFragments.values()) };
  }

  throw new Error(`All models failed (last: ${lastError})`);
}

/* ── Agent Loop ── */

const MAX_CONTEXT_TOKENS = 24000;

function estimateTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}

export async function* agentLoopServer(opts: {
  agent?: AgentDefinition;
  systemPrompt: string;
  messages: { role: string; content: string }[];
  config?: LoopConfig;
  tools?: Array<{ type: string; function: object }>;
}): AsyncGenerator<SSEEvent> {
  const { systemPrompt, messages, config = DEFAULT_LOOP_CONFIG, tools, agent } = opts;
  const modelPreference = agent?.model;
  const toolWhitelist = agent?.toolNames?.length ? agent.toolNames : undefined;
  const state: LoopState = {
    iteration: 0,
    consecutiveFailures: 0,
    contextSize: estimateTokens(messages),
    phase: "understanding",
  };

  let ctx: DeepSeekMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  let autoRetryCount = 0;
  const MAX_AUTO_RETRY = 2;
  const recentCalls: { name: string; params: string; result: string }[] = [];

  while (state.iteration < config.maxIterations) {
    state.iteration++;

    if (state.contextSize > MAX_CONTEXT_TOKENS) {
      ctx = ctx.slice(-15);
      state.contextSize = estimateTokens(ctx);
    }

    const phase: AgentPhase = state.iteration === 1 ? "understanding" : "reflecting";
    state.phase = phase;
    yield { type: "phase", phase };

    // Call DeepSeek
    let thinkText: string;
    let toolCalls: NativeToolCall[];
    try {
      const resp = await callLLM(ctx, systemPrompt, tools, modelPreference);
      thinkText = resp.text;
      toolCalls = resp.toolCalls;
    } catch (err) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `AI 请求失败: ${err instanceof Error ? err.message : "未知错误"}` };
      yield { type: "done" };
      return;
    }

    if (toolCalls.length === 0) {
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };

      const responseText = thinkText.trim();
      if (responseText) {
        yield { type: "text", content: responseText };
      } else {
        yield { type: "text", content: "操作完成。" };
      }

      ctx.push({ role: "assistant", content: thinkText });
      break;
    }

    // Execute tool calls
    for (const tc of toolCalls) {
      let params: Record<string, unknown>;
      try { params = JSON.parse(tc.arguments); } catch { continue; }

      const paramsKey = JSON.stringify(params);
      const recent = recentCalls.find((c) => c.name === tc.name && c.params === paramsKey);
      let toolResult: ToolResult;
      let formatted: string;

      if (recent) {
        toolResult = { success: true, data: recent.result };
        formatted = recent.result;
      } else {
        state.phase = "executing";
        yield { type: "phase", phase: "executing" };
        yield { type: "tool_call", name: tc.name, params };

        if (toolWhitelist && !toolWhitelist.includes(tc.name)) {
          const errMsg = `工具 ${tc.name} 不在当前 Agent 模式下可用`;
          yield { type: "tool_result", name: tc.name, result: errMsg, success: false };
          ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->${errMsg}` });
          state.consecutiveFailures++;
          continue;
        }

        try {
          toolResult = await executeTool(tc.name, params);
        } catch (execErr) {
          toolResult = { success: false, data: null, error: execErr instanceof Error ? execErr.message : "Tool execution error" };
        }
        formatted = formatToolResult(toolResult, tc.name);
        recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
        if (recentCalls.length > 5) recentCalls.shift();
      }

      yield { type: "tool_result", name: tc.name, result: formatted, success: toolResult.success };

      // ── Self-healing: yield error info so LLM can adapt ──
      if (!toolResult.success) {
        yield { type: "tool_error", name: tc.name, error: toolResult.error || "未知错误", recoverable: toolResult.recoverable !== false };
      }

      state.phase = "verifying";
      yield { type: "phase", phase: "verifying" };

      const quality = checkResultQuality(formatted);
      yield { type: "result_quality", quality };

      if (toolResult.success) {
        state.consecutiveFailures = 0;
      } else {
        state.consecutiveFailures++;
      }

      let qualityHint = "";
      if (!toolResult.success) {
        if (toolResult.recoverable === false) {
          // Permanent failure — do NOT retry, just tell user
          qualityHint = `\n<!-- ⚠️ 工具执行失败（无法重试）: ${toolResult.error || "未知错误"}。请直接告知用户原因并引导用户操作。 -->`;
        } else {
          qualityHint = `\n<!-- ⚠️ 工具执行失败: ${toolResult.error || "未知错误"}。${toolResult.retryHint || "请换参数重试、使用其他工具获取信息、或基于已有知识直接回答。"} -->`;
          autoRetryCount++;
        }
      } else if (quality === "empty") {
        qualityHint = "\n<!-- ⚠️ 搜索结果为空，请在下一轮换不同关键词重新搜索。不要直接回复用户。 -->";
        autoRetryCount++;
      } else if (quality === "irrelevant") {
        qualityHint = "\n<!-- ⚠️ 搜索结果不相关（可能是同名文化作品等），请换更精确的关键词重新搜索。不要直接回复用户。 -->";
        autoRetryCount++;
      } else {
        autoRetryCount = 0;
      }

      ctx.push({
        role: "user",
        content: `<!-- tool:${tc.name} result -->\n${formatted}${qualityHint}\n\n【请基于以上工具返回的数据进行深度分析和扩容解释。不要仅复述数据——要分析原因、风险判断、面试追问策略和行动建议。】`,
      });
      state.contextSize = estimateTokens(ctx);
    }

    if (state.consecutiveFailures >= 2) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `工具连续失败 ${state.consecutiveFailures} 次，请检查配置或稍后重试。` };
      yield { type: "done" };
      return;
    }

    if (autoRetryCount > MAX_AUTO_RETRY) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `搜索暂不可用（已尝试 ${autoRetryCount} 次），以下是我基于已有知识的分析：` };
      try {
        const forceResp = await callLLM(ctx, systemPrompt, tools, modelPreference);
        const clean = forceResp.text.trim();
        if (clean) yield { type: "text", content: clean };
      } catch { /* ignore */ }
      yield { type: "done" };
      return;
    }
  }

  if (state.iteration >= config.maxIterations && state.phase !== "responding") {
    state.phase = "responding";
    yield { type: "phase", phase: "responding" };
    yield { type: "text", content: "达到思考上限，请重新提问。" };
  }

  yield { type: "done" };
}
