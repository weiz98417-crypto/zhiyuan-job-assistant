/**
 * Server-side Agent ReAct Loop
 *
 * Runs inside /api/agent/run. Directly calls DeepSeek API (API key on server)
 * and executes tools via registry.execute() (no fetch proxy).
 *
 * Quality-gated loop logic ported from client-runner.ts.
 */
import type { LoopConfig, LoopState, SSEEvent, AgentPhase, ResultQuality } from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";
import { isGarbledText } from "./text-quality";
import { executeTool, formatToolResult, getTool } from "@/lib/agent/tools";
import type { ToolResult, ErrorCategory } from "@/lib/agent/tools/types";
import type { AgentDefinition } from "@/lib/agent/registry/types";

/* ── Context cap (per-tool) ── */
const DEFAULT_TOOL_CTX_CAP = 800;
function getLLMContext(result: ToolResult, toolName: string): string {
  let text = result.llmSummary ?? "";
  if (!text) {
    const toolDef = getTool(toolName);
    if (toolDef?.formatResult) text = toolDef.formatResult(result);
  }
  const toolDef = getTool(toolName);
  const max = toolDef?.toolCtxCap ?? DEFAULT_TOOL_CTX_CAP;
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n<!-- 结果已截断，完整数据仅展示在 UI 中 -->";
}

/* ── Quality check ── */

const GARBLED_RECOVERY_HINT =
  "内容编码异常（乱码），无法自动解析。请直接告知用户文档可能存在编码问题，" +
  "并引导用户：1) 直接粘贴简历文本内容 2) 将文档另存为 UTF-8 编码的 .txt 文件后重新上传 3) 发送截图";

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
  // Must be AFTER empty/irrelevant checks — garbled text is non-empty and non-entertainment
  if (isGarbledText(trimmed)) {
    return "garbled";
  }
  return "good";
}

/* ── Error category dispatch (modeled after OpenAI Assistants + LangChain) ── */

const ERROR_CATEGORY_ACTIONS: Record<ErrorCategory, { autoRetry: boolean; degradeToUser: boolean }> = {
  ok:              { autoRetry: false, degradeToUser: false },
  transient:       { autoRetry: true,  degradeToUser: false },
  permanent:       { autoRetry: false, degradeToUser: true  },
  need_user_input: { autoRetry: false, degradeToUser: true  },
};

function resolveErrorCategory(result: ToolResult): ErrorCategory {
  if (result.errorCategory) return result.errorCategory;
  return result.success ? "ok" : "permanent";
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
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        lastError = `${model} network: ${err instanceof Error ? err.message : String(err)}`;
        break; // Network error → try next model
      }
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

const MAX_CONTEXT_TOKENS = 64000;

function estimateTokens(messages: { role: string; content: string }[]): number {
  // CJK-aware: Chinese chars ≈ 1.5-2 tokens, English chars ≈ 0.25 tokens.
  // Replacing CJK with "aa" brings chars-to-token ratio to ~1:1 for mixed text.
  return messages.reduce((sum, m) => sum + m.content.replace(/[\u4e00-\u9fff]/g, 'aa').length, 0);
}

export async function* agentLoopServer(opts: {
  agent?: AgentDefinition;
  systemPrompt: string;
  messages: { role: string; content: string }[];
  config?: LoopConfig;
  tools?: Array<{ type: string; function: object }>;
  signal?: AbortSignal;
}): AsyncGenerator<SSEEvent> {
  const { systemPrompt, messages, config = DEFAULT_LOOP_CONFIG, tools, agent, signal } = opts;
  const modelPreference = agent?.model;
  const toolWhitelist = agent?.toolNames?.length ? agent.toolNames : undefined;
  const state: LoopState = {
    iteration: 0,
    consecutiveFailures: 0,
    contextSize: estimateTokens(messages) + systemPrompt.replace(/[\u4e00-\u9fff]/g, 'aa').length,
    phase: "understanding",
  };

  let ctx: DeepSeekMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  let autoRetryCount = 0;
  let forceTextOnly = false; // Set after degradeToUser: next LLM response is text-only, no tools
  const MAX_AUTO_RETRY = 2;
  const recentCalls: { name: string; params: string; result: string }[] = [];
  const intermediateSteps: { tool: string; params: string; category: ErrorCategory; summary: string }[] = [];

  while (state.iteration < config.maxIterations) {
    if (signal?.aborted) {
      yield { type: "done" };
      return;
    }
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

    // ── forceTextOnly guard: after permanent error, respond with text only, no tools ──
    if (forceTextOnly) {
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };
      const responseText = thinkText.trim();
      if (responseText) {
        yield { type: "text", content: responseText };
      } else {
        yield { type: "text", content: "抱歉，操作未能完成。请换个方式提问或稍后重试。" };
      }
      ctx.push({ role: "assistant", content: thinkText });
      break;
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
        toolResult = { success: true, data: recent.result, errorCategory: "ok" as const };
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
          toolResult = { success: false, data: null, error: execErr instanceof Error ? execErr.message : "Tool execution error", errorCategory: "transient" as const };
        }
        formatted = formatToolResult(toolResult, tc.name);
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

      // ── Error category dispatch ──
      const category = resolveErrorCategory(toolResult);
      const action = ERROR_CATEGORY_ACTIONS[category];

      if (action.degradeToUser) {
        const errorObs = `[TOOL_ERROR tool=${tc.name} category=${category}] ${toolResult.error || "操作失败"}\n\n请基于此错误告知用户发生了什么，并给出具体的下一步建议。`;
        ctx.push({ role: "user", content: errorObs });
        forceTextOnly = true;
        state.contextSize = estimateTokens(ctx);
        state.consecutiveFailures++;
        intermediateSteps.push({ tool: tc.name, params: paramsKey, category, summary: (toolResult.error || "操作失败").slice(0, 100) });
        continue; // DO NOT cache degraded results
      }

      // Only cache successful / non-degraded results
      recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
      if (recentCalls.length > 5) recentCalls.shift();

      if (action.autoRetry) {
        autoRetryCount++;
      } else {
        autoRetryCount = 0;
      }

      intermediateSteps.push({
        tool: tc.name, params: paramsKey, category,
        summary: toolResult.success ? (formatted.slice(0, 100)) : (toolResult.error || "失败").slice(0, 100),
      });

      const categoryHints: Record<ErrorCategory, string> = {
        ok:              "",
        transient:       "\n<!-- ⚠️ 搜索未找到理想结果，请换参数重试。 -->",
        permanent:       "",
        need_user_input: "",
      };
      const hint = categoryHints[category]
        || (quality === "empty" ? "\n<!-- ⚠️ 搜索结果为空，请在下一轮换不同关键词重新搜索。不要直接回复用户。 -->"
            : quality === "irrelevant" ? "\n<!-- ⚠️ 搜索结果不相关（可能是同名文化作品等），请换更精确的关键词重新搜索。不要直接回复用户。 -->"
            : "");

      if (tc.name === "export_file" || tc.name === "download_report_pdf") {
        const d = (toolResult.data as { filename?: string }) || {};
        ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->已导出文件: ${d.filename || "download"}。用户设备已自动下载。` });
      } else {
        const llmText = getLLMContext(toolResult, tc.name);
        ctx.push({
          role: "user",
          content: `<!-- tool:${tc.name} result -->\n${llmText}${hint}\n\n【请基于以上工具返回的数据进行深度分析和扩容解释。不要仅复述数据——要分析原因、风险判断、面试追问策略和行动建议。】`,
        });
      }
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
    if (intermediateSteps.length > 0) {
      const lines = intermediateSteps.map(s => `- ${s.tool}: ${s.summary} [${s.category}]`);
      yield { type: "text", content: `已尝试 ${intermediateSteps.length} 次工具调用，未能完成任务：\n${lines.join("\n")}\n\n请换个方式提问。` };
    } else {
      yield { type: "text", content: "达到处理上限，请重新提问。" };
    }
  }

  yield { type: "done" };
}
