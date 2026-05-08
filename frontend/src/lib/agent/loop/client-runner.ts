import type { LoopConfig, LoopState, SSEEvent } from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";
import { executeTool, formatToolResult } from "@/lib/agent/tools";
import type { ToolResult } from "@/lib/agent/tools/types";

export type { SSEEvent };

/* ── Result quality check ── */

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

const MAX_MESSAGES = 30;
const MAX_CONTEXT_TOKENS = 24000;

/* ── Tool tag parsing ── */

function stripCodeFences(text: string): string {
  return text
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();
}

const TOOL_RE_EXACT = new RegExp("<<TOOL>>\\s*(\\S+)\\s*\\n([\\s\\S]*?)<</TOOL>>");

function findLastMarker(text: string, marker: string): number {
  return text.lastIndexOf(marker);
}

function parseToolCall(text: string): { name: string; params: Record<string, unknown> } | null {
  let match = text.match(TOOL_RE_EXACT);
  let paramsText: string | undefined;

  if (match) {
    paramsText = match[2].trim();
  } else {
    const stripped = stripCodeFences(text);
    match = stripped.match(TOOL_RE_EXACT);
    if (match) {
      paramsText = match[2].trim();
    } else {
      const idx = findLastMarker(text, "<<TOOL>>");
      if (idx === -1) return null;
      const after = text.slice(idx + 8);
      const nameMatch = after.match(/^\s*(\S+)/);
      if (!nameMatch) return null;
      const name = nameMatch[1];
      const paramsStart = after.indexOf("\n");
      const paramsEnd = after.indexOf("<</TOOL>>");
      // Fallback: if no closing tag, take params to end of text or next <<TOOL>>
      const effectiveEnd = paramsEnd !== -1 ? paramsEnd : (after.indexOf("<<TOOL>>", paramsStart + 1) !== -1 ? after.indexOf("<<TOOL>>", paramsStart + 1) : after.length);
      if (paramsStart === -1) return null;
      paramsText = after.slice(paramsStart, effectiveEnd).trim();
      try {
        const params = JSON.parse(paramsText);
        console.log("[loop] parsed tool call (no closing tag):", name);
        return { name, params };
      } catch {
        return null;
      }
    }
  }

  try {
    const params = JSON.parse(paramsText!);
    return { name: match![1], params };
  } catch {
    return null;
  }
}

/** Extract text before `<<TOOL>>` as thinking content. Only show when no tool call follows. */
function extractThinkingContent(text: string): string {
  const toolIdx = text.indexOf("<<TOOL>>");
  // Show thinking content even when tools follow — the user wants
  // visibility into the agent's reasoning.
  const content = toolIdx !== -1 ? text.slice(0, toolIdx).trim() : text.trim();
  if (!content) return "";
  if (content.length > 300) return content.slice(0, 300) + "...";
  return content;
}

/* ── Context helpers ── */

function estimateTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}

function truncateContext(
  messages: { role: string; content: string }[],
  keepLast: number,
): { role: string; content: string }[] {
  if (messages.length <= keepLast) return messages;
  return messages.slice(-keepLast);
}

/* ── Think proxy helpers ── */

/** Tool-calling directive + research protocol injected into every think call.
 *  DeepSeek Flash follows conversation-level instructions better than system prompts. */
const RESEARCH_PROTOCOL = `\n\n【最高优先级指令 — 必须遵守】

**回复格式（必须照抄，包括闭合标签）：**
<<TOOL>>工具名
{"参数":"值"}
<</TOOL>>

**研究流程：**
1. 拆实体：用户提到了几个独立实体？不要把不同实体合并搜索
   - 例：「安世亚太和大连的CAE企业」→ 实体1=安世亚太（公司），实体2=大连的CAE企业（需发现）
   - ❌ 错误：「安世亚太 大连 分公司」（把两个独立实体合并了）
2. 先发现再深入：对于"某地的XX企业"这类，先搜"XX 有哪些企业"，拿到名单后再逐个搜
3. 每个实体单独搜一次
4. 验证结果质量（电视剧/游戏=失败，换词重试）
5. 全部搜完后整合输出

**第1步必须做实体拆解，不要把"A公司和B地的X企业"合并成一个搜索。**`;

function injectResearchProtocol(
  messages: { role: string; content: string }[],
  searchProgress: string,
  skip?: boolean,
): { role: string; content: string }[] {
  if (skip) return messages;
  return messages.map((m, i) => {
    if (i === messages.length - 1 && m.role === "user" && !m.content.includes("【最高优先级指令")) {
      return { ...m, content: m.content + RESEARCH_PROTOCOL };
    }
    return m;
  });
}

function buildSearchProgress(
  recentCalls: { name: string; params: string; result: string }[],
  isFirstIteration: boolean,
): string {
  if (isFirstIteration || recentCalls.length === 0) return "";
  const calls = recentCalls
    .map((c) => `  - web_search("${(JSON.parse(c.params) as Record<string,unknown>).query}")`)
    .join("\n");
  return `\n\n【已执行的搜索】\n${calls}\n【注意】如果以上搜索还没覆盖用户提到的所有实体，请继续搜索遗漏的实体。`;
}

async function fetchFromThinkProxy(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  searchProgress = "",
  skipResearchProtocol?: boolean,
): Promise<Response> {
  let withDirective = injectResearchProtocol(messages, searchProgress, skipResearchProtocol);
  // Append search progress as a separate user message if present
  if (searchProgress) {
    withDirective = [...withDirective, { role: "user" as const, content: searchProgress }];
  }
  const truncated = withDirective.slice(-MAX_MESSAGES);
  return fetch("/api/agent/think", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, messages: truncated }),
    signal,
  });
}

async function collectThinkText(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
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
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "text" && parsed.content) {
          fullText += parsed.content;
        }
      } catch {
        /* skip */
      }
    }
  }
  return fullText;
}

/* ── Agent Loop (client-side) — quality-gated ReAct cycle ── */

export async function* agentLoopClient(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  config: LoopConfig = DEFAULT_LOOP_CONFIG,
  signal?: AbortSignal,
  skipResearchProtocol?: boolean,
  toolWhitelist?: string[],
): AsyncGenerator<SSEEvent> {
  const state: LoopState = {
    iteration: 0,
    consecutiveFailures: 0,
    contextSize: estimateTokens(messages),
    phase: "understanding",
  };

  let ctx = [...messages];
  let firstIteration = true;
  let autoRetryCount = 0;
  const MAX_AUTO_RETRY = 2;
  const recentCalls: { name: string; params: string; result: string }[] = [];

  while (state.iteration < config.maxIterations) {
    if (signal?.aborted) {
      yield { type: "done" };
      return;
    }

    state.iteration++;

    // Context truncation
    if (state.contextSize > MAX_CONTEXT_TOKENS) {
      ctx = truncateContext(ctx, 15);
      state.contextSize = estimateTokens(ctx);
    }

    // ── Phase 1: Understanding (识别中) or Reflecting (分析结果中) ──
    if (firstIteration) {
      state.phase = "understanding";
      yield { type: "phase", phase: "understanding" };
    } else {
      state.phase = "reflecting";
      yield { type: "phase", phase: "reflecting" };
    }

    const searchProgress = buildSearchProgress(recentCalls, firstIteration);

    let thinkText: string;
    try {
      const thinkResponse = await fetchFromThinkProxy(systemPrompt, ctx, signal, searchProgress, skipResearchProtocol);
      if (!thinkResponse.ok) {
        yield { type: "phase", phase: "responding" };
        yield { type: "text", content: `AI 请求失败: ${thinkResponse.status}` };
        yield { type: "done" };
        return;
      }
      thinkText = await collectThinkText(thinkResponse);
      console.log("[loop] thinkText length:", thinkText.length, "preview:", thinkText.slice(0, 300));
    } catch (err) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `请求失败: ${err instanceof Error ? err.message : "未知错误"}` };
      yield { type: "done" };
      return;
    }

    if (signal?.aborted) {
      yield { type: "done" };
      return;
    }

    // Yield any thinking content (only when no tool call follows)
    const thinkingContent = extractThinkingContent(thinkText);
    if (thinkingContent) {
      yield { type: "thinking_content", content: thinkingContent };
    }

    const toolCall = parseToolCall(thinkText);

    if (!toolCall) {
      console.log("[loop] no tool call in thinkText. Full text:", thinkText.slice(0, 500));
      // ── No tool needed → Respond ──
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };

      let responseText = thinkText;
      responseText = responseText.replace(new RegExp("<<TOOL>>[\\s\\S]*?<</TOOL>>", "g"), "");
      const rogueToolIdx = responseText.indexOf("<<TOOL>>");
      if (rogueToolIdx !== -1) {
        responseText = responseText.slice(0, rogueToolIdx);
      }
      responseText = responseText.trim();

      if (responseText) {
        for (let i = 0; i < responseText.length; i += 8) {
          if (signal?.aborted) break;
          yield { type: "text", content: responseText.slice(i, i + 8) };
          await new Promise((r) => setTimeout(r, 5));
        }
      } else {
        yield { type: "text", content: "操作完成。" };
      }

      ctx.push({ role: "assistant", content: thinkText });
      break;
    }

    // ── Phase 2: Executing (调用工具搜索) ──
    // Dedup: skip if same tool+params was called recently
    const paramsKey = JSON.stringify(toolCall.params);
    const recent = recentCalls.find((c) => c.name === toolCall.name && c.params === paramsKey);
    let toolResult: ToolResult;
    let formatted: string;
    if (recent) {
      toolResult = { success: true, data: recent.result };
      formatted = recent.result;
      console.log(`[loop] dedup: skipping repeat call to ${toolCall.name}`);
    } else {
      state.phase = "executing";
      yield { type: "phase", phase: "executing" };
      yield { type: "tool_call", name: toolCall.name, params: toolCall.params };

      // Tool whitelist enforcement (multi-agent architecture)
      if (toolWhitelist && !toolWhitelist.includes(toolCall.name)) {
        const errMsg = `工具 ${toolCall.name} 不在当前 Agent 模式下可用`;
        console.warn(`[loop] blocked: ${errMsg}`);
        yield {
          type: "tool_result",
          name: toolCall.name,
          result: errMsg,
          success: false,
        };
        // Inject error into context so LLM can adapt
        ctx.push({ role: "user", content: `<!-- tool:${toolCall.name} result -->${errMsg}。请使用可用工具重新尝试，或直接基于已有知识回答。` });
        state.consecutiveFailures++;
        continue;
      }

      toolResult = await executeTool(toolCall.name, toolCall.params);
      formatted = formatToolResult(toolResult, toolCall.name);
      recentCalls.push({ name: toolCall.name, params: paramsKey, result: formatted });
      if (recentCalls.length > 5) recentCalls.shift();
    }

    yield {
      type: "tool_result",
      name: toolCall.name,
      result: formatted,
      success: toolResult.success,
    };

    // ── Phase 3: Verifying (确认结果正确性) ──
    state.phase = "verifying";
    yield { type: "phase", phase: "verifying" };

    const quality = checkResultQuality(formatted);
    yield { type: "result_quality", quality };

    if (toolResult.success) {
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures++;
    }

    // Build context with quality hint for LLM
    let qualityHint = "";
    if (quality === "empty") {
      qualityHint = "\n<!-- ⚠️ 搜索结果为空，请在下一轮换不同关键词重新搜索。不要直接回复用户。 -->";
      autoRetryCount++;
    } else if (quality === "irrelevant") {
      qualityHint = "\n<!-- ⚠️ 搜索结果不相关（可能是同名文化作品等），请换更精确的关键词重新搜索。不要直接回复用户。 -->";
      autoRetryCount++;
    } else {
      autoRetryCount = 0; // Reset on good result
    }

    ctx.push({
      role: "user",
      content: `<!-- tool:${toolCall.name} result -->\n${formatted}${qualityHint}`,
    });
    state.contextSize = estimateTokens(ctx);

    // Hard stop: consecutively bad results
    if (state.consecutiveFailures >= 2) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `工具连续失败 ${state.consecutiveFailures} 次，请检查配置或稍后重试。` };
      yield { type: "done" };
      return;
    }

    // Auto-retry limit: force LLM to respond after too many retries
    if (autoRetryCount > MAX_AUTO_RETRY) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `搜索暂不可用（已尝试 ${autoRetryCount} 次），以下是我基于已有知识的分析：` };
      // Let LLM think one more time without quality hint
      const forceResponse = await fetchFromThinkProxy(systemPrompt, ctx, signal, "", skipResearchProtocol);
      if (forceResponse.ok) {
        const forceText = await collectThinkText(forceResponse);
        const clean = forceText
          .replace(new RegExp("<<TOOL>>[\\s\\S]*?<</TOOL>>", "g"), "")
          .replace(/<<TOOL>>[\s\S]*/, "")
          .trim();
        if (clean) {
          for (let i = 0; i < clean.length; i += 8) {
            if (signal?.aborted) break;
            yield { type: "text", content: clean.slice(i, i + 8) };
            await new Promise((r) => setTimeout(r, 5));
          }
        }
      }
      yield { type: "done" };
      return;
    }

    firstIteration = false;
  }

  // Max iterations — force respond
  if (state.iteration >= config.maxIterations && state.phase !== "responding") {
    state.phase = "responding";
    yield { type: "phase", phase: "responding" };
    yield { type: "text", content: "达到思考上限，请重新提问。" };
  }

  yield { type: "done" };
}
