import type { LoopConfig, LoopState, SSEEvent } from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";
import { executeTool, formatToolResult } from "@/lib/agent/tools";
import type { ToolResult } from "@/lib/agent/tools/types";
import db from "@/lib/db";
import { createJD } from "@/lib/jd-storage";

export type { SSEEvent };

/* ── Result quality check ── */

type ResultQuality = "good" | "empty" | "irrelevant";

function checkResultQuality(formatted: string): ResultQuality {
  const trimmed = formatted.trim();
  if (!trimmed || trimmed === "未找到相关结果" || trimmed === "搜索失败: 未找到相关结果") {
    return "empty";
  }
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

/* ── Tool call handling (native function calling) ── */

type NativeToolCall = { id: string; name: string; arguments: string };

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

/** Cap tool result text entering LLM context.
 *  Full data is shown to user via React components — LLM only needs a signal. */
const MAX_TOOL_CTX = 600;
function capToolCtx(text: string, toolName: string): string {
  if (text.length <= MAX_TOOL_CTX) return text;
  const head = text.slice(0, MAX_TOOL_CTX);
  return `${head}\n...[已截断: 原始${text.length}字, 完整内容已通过前端组件展示]`;
}

/* ── Think proxy helpers ── */

const RESEARCH_PROTOCOL = `\n\n【研究流程】
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
  // Inject as a separate system message instead of appending to user message
  // to avoid confusing the LLM about what the user actually said
  const withProtocol = [...messages];
  withProtocol.push({ role: "system", content: RESEARCH_PROTOCOL.trim() });
  return withProtocol;
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
  tools?: Array<{ type: string; function: object }>,
): Promise<Response> {
  let withDirective = injectResearchProtocol(messages, searchProgress, skipResearchProtocol);
  if (searchProgress) {
    withDirective = [...withDirective, { role: "user" as const, content: searchProgress }];
  }
  const truncated = withDirective.slice(-MAX_MESSAGES);
  return fetch("/api/agent/think", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, messages: truncated, ...(tools?.length ? { tools } : {}) }),
    signal,
  });
}

/* ── Streaming Think Response Collector ── */

/**
 * Reads SSE stream from think proxy and yields text chunks as they arrive.
 * Tool calls are accumulated and yielded as a final event.
 */
async function* collectThinkResponseStreaming(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent, { text: string; toolCalls: NativeToolCall[] }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  const toolCalls: NativeToolCall[] = [];
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
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
            yield { type: "text", content: parsed.content };
          } else if (parsed.type === "tool_calls" && Array.isArray(parsed.tool_calls)) {
            for (const tc of parsed.tool_calls) {
              toolCalls.push(tc);
            }
          }
        } catch {
          /* skip */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (toolCalls.length > 0) {
    yield { type: "tool_calls", tool_calls: toolCalls };
  }

  return { text: fullText, toolCalls };
}

/* ── Agent Loop (client-side) — quality-gated ReAct cycle ── */

export async function* agentLoopClient(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  config: LoopConfig = DEFAULT_LOOP_CONFIG,
  signal?: AbortSignal,
  skipResearchProtocol?: boolean,
  toolWhitelist?: string[],
  tools?: Array<{ type: string; function: object }>,
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

    if (state.contextSize > MAX_CONTEXT_TOKENS) {
      ctx = truncateContext(ctx, 15);
      state.contextSize = estimateTokens(ctx);
    }

    // ── Phase 1: Understanding / Reflecting ──
    if (firstIteration) {
      state.phase = "understanding";
      yield { type: "phase", phase: "understanding" };
    } else {
      state.phase = "reflecting";
      yield { type: "phase", phase: "reflecting" };
    }

    const searchProgress = buildSearchProgress(recentCalls, firstIteration);

    let thinkText: string;
    let toolCalls: NativeToolCall[];
    try {
      const thinkResponse = await fetchFromThinkProxy(systemPrompt, ctx, signal, searchProgress, skipResearchProtocol, tools);
      if (!thinkResponse.ok) {
        yield { type: "phase", phase: "responding" };
        yield { type: "text", content: `AI 请求失败: ${thinkResponse.status}` };
        yield { type: "done" };
        return;
      }

      // Use streaming collector — yields text chunks as they arrive
      const streamGen = collectThinkResponseStreaming(thinkResponse, signal);
      let streamResult: IteratorResult<SSEEvent, { text: string; toolCalls: NativeToolCall[] }>;
      while (true) {
        streamResult = await streamGen.next();
        if (streamResult.done) break;
        yield streamResult.value;
      }
      thinkText = streamResult.value.text;
      toolCalls = streamResult.value.toolCalls;
      console.log("[loop] thinkText length:", thinkText.length, "toolCalls:", toolCalls.length);
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

    // Note: preview loop removed — text is now streamed in real-time by collectThinkResponseStreaming

    if (toolCalls.length === 0) {
      // ── No tool needed → Respond ──
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };

      let responseText = thinkText.trim();
      if (responseText) {
        // Text already streamed by collectThinkResponseStreaming above.
        // Only emit the final phase event — don't re-stream the text.
      } else {
        yield { type: "text", content: "操作完成。" };
      }

      ctx.push({ role: "assistant", content: thinkText });
      break;
    }

    // ── Phase 2: Executing (native tool calls) ──
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
        console.log(`[loop] dedup: skipping repeat call to ${tc.name}`);
      } else {
        state.phase = "executing";
        yield { type: "phase", phase: "executing" };
        yield { type: "tool_call", name: tc.name, params };

        if (toolWhitelist && !toolWhitelist.includes(tc.name)) {
          const errMsg = `工具 ${tc.name} 不在当前 Agent 模式下可用`;
          console.warn(`[loop] blocked: ${errMsg}`);
          yield { type: "tool_result", name: tc.name, result: errMsg, success: false };
          ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->${errMsg}。请使用可用工具重新尝试，或直接基于已有知识回答。` });
          state.consecutiveFailures++;
          continue;
        }

        try {
          toolResult = await executeTool(tc.name, params);
        } catch (execErr) {
          toolResult = { success: false, data: null, error: execErr instanceof Error ? execErr.message : "Tool execution error" };
        }

        // ═════════════════════════════════════════════════════════
        // Stream Delegation: if tool returned a ReadableStream,
        // read it and yield events through the generator loop.
        // ═════════════════════════════════════════════════════════
        const isStreaming = toolResult._streaming && toolResult.data;
        const toolStream = isStreaming
          ? (toolResult.data as Record<string, unknown>)?._stream as ReadableStream<Uint8Array> | undefined
          : undefined;

        if (toolStream) {
          const reader = toolStream.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let finalData: Record<string, unknown> = {};

          try {
            while (true) {
              if (signal?.aborted) { reader.cancel(); break; }
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const streamLines = buf.split("\n");
              buf = streamLines.pop() || "";
              for (const streamLine of streamLines) {
                if (!streamLine.startsWith("data: ")) continue;
                try {
                  const event = JSON.parse(streamLine.slice(6));
                  // Forward stream events to UI
                  yield event as SSEEvent;
                  // Extract finalData from the done event (flat fields, NOT nested under .data)
                  if (event.type === "done" && event.company) {
                    finalData = event as Record<string, unknown>;
                  }
                } catch { /* skip malformed */ }
              }
            }
          } finally {
            reader.releaseLock();
          }

          // Persist after stream completes
          console.log("[loop] persist check:", { company: finalData.company, role: finalData.role, hasBlocks: !!finalData.blocks });
          if (finalData.company && finalData.role) {
            try {
              const persistRes = await fetch("/api/agent/persist-eval", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalData),
              });
              const persistJson = await persistRes.json();
              console.log("[loop] persist result:", persistJson);
              if (persistJson.success) {
                // Also save to client-side Dexie (IndexedDB) so UI pages can find the data
                const d = finalData;
                const reportNum = persistJson.reportNum || 0;
                const blocks = (d.blocks || {}) as Record<string, { content: string; score: number }>;
                const today = new Date().toISOString().split("T")[0];
                try {
                  await db.reports.add({
                    reportNum,
                    date: (d.date as string) || today,
                    company: (d.company as string) || "",
                    role: (d.role as string) || "",
                    archetype: (d.archetype as string) || "",
                    overallScore: (d.overallScore as number) || 0,
                    legitimacy: (d.legitimacy as string) || "",
                    blocks: {
                      a: typeof blocks.a === "string" ? blocks.a : blocks.a?.content || "",
                      b: typeof blocks.b === "string" ? blocks.b : blocks.b?.content || "",
                      c: typeof blocks.c === "string" ? blocks.c : blocks.c?.content || "",
                      d: typeof blocks.d === "string" ? blocks.d : blocks.d?.content || "",
                      e: typeof blocks.e === "string" ? blocks.e : blocks.e?.content || "",
                      f: typeof blocks.f === "string" ? blocks.f : blocks.f?.content || "",
                      g: typeof blocks.g === "string" ? blocks.g : blocks.g?.content || "",
                    },
                    scores: {
                      a: blocks.a?.score || 0, b: blocks.b?.score || 0, c: blocks.c?.score || 0,
                      d: blocks.d?.score || 0, e: blocks.e?.score || 0, f: blocks.f?.score || 0, g: "",
                    },
                    keywords: Array.isArray(d.keywords) ? d.keywords as string[] : [],
                    createdAt: new Date(),
                  });
                } catch (e) { console.warn("[loop] dexie report save failed:", e); }

                // Save JD to client-side Dexie
                const jdText = (d.jdText as string) || "";
                if (jdText.trim().length >= 50) {
                  try {
                    await createJD({
                      company: (d.company as string) || "",
                      role: (d.role as string) || "",
                      sourceType: "agent",
                      body: jdText,
                      keywords: (Array.isArray(d.keywords) ? d.keywords : []) as string[],
                    });
                  } catch (e) { console.warn("[loop] dexie JD save failed:", e); }
                }

                yield {
                  type: "persist_done",
                  reportNum: reportNum,
                  company: d.company as string,
                  role: d.role as string,
                  score: (d.overallScore as number) || 0,
                };
              }
            } catch (err) {
              console.error("[loop] persist failed:", err);
            }
          } else {
            console.warn("[loop] persist skipped: missing company or role");
          }

          formatted = formatToolResult({ success: true, data: finalData }, tc.name);
          yield { type: "tool_result", name: tc.name, result: formatted, success: true, data: finalData };

          // Push formatted result to context for LLM summary in next iteration
          ctx.push({
            role: "user",
            content: capToolCtx(`<!-- tool:${tc.name} result -->\n${formatted}\n\n【请基于以上工具返回的数据进行深度分析和扩容解释。不要仅复述数据——要分析原因、风险判断、面试追问策略和行动建议。】`, tc.name),
          });
          state.contextSize = estimateTokens(ctx);
          state.consecutiveFailures = 0;
          recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
          if (recentCalls.length > 5) recentCalls.shift();
          continue; // Skip the normal post-tool logic below
        }

        // ── Non-streaming tool: existing logic ──
        formatted = formatToolResult(toolResult, tc.name);
        recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
        if (recentCalls.length > 5) recentCalls.shift();
      }

      yield { type: "tool_result", name: tc.name, result: formatted, success: toolResult.success, data: toolResult.data };

      // ── Self-healing ──
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
        content: capToolCtx(`<!-- tool:${tc.name} result -->\n${formatted}${qualityHint}\n\n【请基于以上工具返回的数据进行深度分析和扩容解释。不要仅复述数据——要分析原因、风险判断、面试追问策略和行动建议。】`, tc.name),
      });
      state.contextSize = estimateTokens(ctx);
    }

    // Hard stop: consecutively bad results
    if (state.consecutiveFailures >= 2) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `工具连续失败 ${state.consecutiveFailures} 次，请检查配置或稍后重试。` };
      yield { type: "done" };
      return;
    }

    // Auto-retry limit
    if (autoRetryCount > MAX_AUTO_RETRY) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `搜索暂不可用（已尝试 ${autoRetryCount} 次），以下是我基于已有知识的分析：` };
      const forceResponse = await fetchFromThinkProxy(systemPrompt, ctx, signal, "", skipResearchProtocol, tools);
      if (forceResponse.ok) {
        const streamGen = collectThinkResponseStreaming(forceResponse, signal);
        let streamResult: IteratorResult<SSEEvent, { text: string; toolCalls: NativeToolCall[] }>;
        while (true) {
          streamResult = await streamGen.next();
          if (streamResult.done) break;
          yield streamResult.value;
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
