import type { LoopConfig, LoopState, ResultQuality, SSEEvent } from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";
import { isGarbledText } from "./text-quality";
import { executeTool, formatToolResult, getTool } from "@/lib/agent/tools";
import type { ToolResult, ErrorCategory } from "@/lib/agent/tools/types";
import db from "@/lib/db";
import { createJD } from "@/lib/jd-storage";

export type { SSEEvent };

/* ── Result quality check ── */

const GARBLED_RECOVERY_HINT =
  "内容编码异常（乱码），无法自动解析。请直接告知用户文档可能存在编码问题，" +
  "并引导用户：1) 直接粘贴简历文本内容 2) 将文档另存为 UTF-8 编码的 .txt 文件后重新上传 3) 发送截图";

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

/** Resolve errorCategory from a ToolResult. Falls back to "permanent" for
 *  unclassified failures (no auto-retry without explicit opt-in). */
function resolveErrorCategory(result: ToolResult): ErrorCategory {
  if (result.errorCategory) return result.errorCategory;
  // Backward compat: old tools without errorCategory — success=ok, failure=permanent
  return result.success ? "ok" : "permanent";
}

const MAX_MESSAGES = 30;
const MAX_CONTEXT_TOKENS = 64000;

/* ── Tool call handling (native function calling) ── */

type NativeToolCall = { id: string; name: string; arguments: string };

/* ── Context helpers ── */

function estimateTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + m.content.replace(/[\u4e00-\u9fff]/g, 'aa').length, 0);
}

function truncateContext(
  messages: { role: string; content: string }[],
  keepLast: number,
): { role: string; content: string }[] {
  if (messages.length <= keepLast) return messages;
  return messages.slice(-keepLast);
}

/** Enforce context budget before pushing. Harness hard-gate, not prompt suggestion. */
function pushWithBudget(
  ctx: { role: string; content: string }[],
  msg: { role: string; content: string },
  maxTokens: number,
): void {
  ctx.push(msg);
  const currentTokens = ctx.reduce((sum, m) => sum + m.content.length, 0);
  if (currentTokens > maxTokens) {
    // Aggressive truncation: keep only last 15 messages
    const kept = ctx.slice(-15);
    ctx.length = 0;
    ctx.push(...kept);
  }
}

/** Get LLM context text from a ToolResult.
 *  Triple-pipe: prefers result.llmSummary, falls back to formatResult(data) for unmigrated tools.
 *  Per-tool cap from ToolDefinition.toolCtxCap, default 800 chars. */
const DEFAULT_TOOL_CTX_CAP = 800;
function getLLMContext(result: ToolResult, toolName: string): string {
  // New tools: use llmSummary directly
  let text = result.llmSummary ?? "";
  // Fallback: unmigrated tools still use formatResult
  if (!text) {
    const toolDef = getTool(toolName);
    if (toolDef?.formatResult) text = toolDef.formatResult(result);
  }
  const toolDef = getTool(toolName);
  const max = toolDef?.toolCtxCap ?? DEFAULT_TOOL_CTX_CAP;
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n<!-- 结果已截断，完整数据仅展示在 UI 中 -->";
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
  // Combine user abort signal with a 120s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('think proxy timeout')), 120_000);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  try {
    return await fetch("/api/agent/think", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt, messages: truncated, ...(tools?.length ? { tools } : {}) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ── Streaming Think Response Collector ── */

/**
 * Reads SSE stream from think proxy and yields text chunks as they arrive.
 * Tool calls are accumulated and yielded as a final event.
 */
async function* collectThinkResponseStreaming(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent, { text: string; toolCalls: NativeToolCall[]; finishReason: string }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  const toolCalls: NativeToolCall[] = [];
  let finishReason = "";
  let buffer = "";

  // Abort promise: resolves with a sentinel when signal fires
  const abortPromise = signal
    ? new Promise<'aborted'>((resolve) => {
        if (signal.aborted) { resolve('aborted'); return; }
        signal.addEventListener('abort', () => resolve('aborted'), { once: true });
      })
    : null;

  try {
    while (true) {
      if (signal?.aborted) break;
      const result = abortPromise
        ? await Promise.race([reader.read(), abortPromise])
        : await reader.read();
      if (result === 'aborted') break;
      const { done, value } = result as ReadableStreamReadResult<Uint8Array>;
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
          } else if (parsed.type === "finish_reason" && parsed.finish_reason) {
            finishReason = parsed.finish_reason as string;
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

  return { text: fullText, toolCalls, finishReason };
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
    contextSize: estimateTokens(messages) + systemPrompt.replace(/[\u4e00-\u9fff]/g, 'aa').length,
    phase: "understanding",
  };

  let ctx = [...messages];
  let firstIteration = true;
  let autoRetryCount = 0;
  let forceTextOnly = false; // Set after degradeToUser: next iteration LLM responds with text only, no tools
  const MAX_AUTO_RETRY = 2;
  const recentCalls: { name: string; params: string; result: string }[] = [];
  // LangChain intermediate_steps pattern: accumulate structured step records for debugging & graceful degradation
  const intermediateSteps: { tool: string; params: string; category: ErrorCategory; summary: string }[] = [];

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
    let finishReason: string;
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
      let streamResult: IteratorResult<SSEEvent, { text: string; toolCalls: NativeToolCall[]; finishReason: string }>;
      while (true) {
        streamResult = await streamGen.next();
        if (streamResult.done) break;
        yield streamResult.value;
      }
      thinkText = streamResult.value.text;
      toolCalls = streamResult.value.toolCalls;
      finishReason = streamResult.value.finishReason;
      console.log("[loop] thinkText length:", thinkText.length, "toolCalls:", toolCalls.length, "finishReason:", finishReason);
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

    // ── forceTextOnly guard: after permanent error, LLM must respond with text, no tools ──
    if (forceTextOnly) {
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };
      if (thinkText.trim()) {
        // Text was already yielded in streaming, just break
      } else {
        yield { type: "text", content: "抱歉，操作未能完成。请换个方式提问或稍后重试。" };
      }
      ctx.push({ role: "assistant", content: thinkText });
      break;
    }

    // ── Decide: continue or stop? Model controls this via finish_reason (Anthropic pattern) ──
    // Backward compat: if finish_reason is missing (old think proxy), fall back to toolCalls.length
    const shouldContinue = finishReason === "tool_calls" || (toolCalls.length > 0 && !finishReason);
    if (!shouldContinue) {
      // ── Model says stop → Respond ──
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };

      let responseText = thinkText.trim();
      if (!responseText) {
        yield { type: "text", content: "操作完成。" };
      }

      ctx.push({ role: "assistant", content: thinkText });
      break;
    }

    // ── Phase 2: Executing (native tool calls) ──
    // Anthropic parallel tool_use pattern: independent query tools run concurrently
    const allIndependent = toolCalls.length > 1 && toolCalls.every(tc => {
      try { const p = JSON.parse(tc.arguments); return p && typeof p === "object"; } catch { return false; }
    }) && toolCalls.every(tc => !toolWhitelist || toolWhitelist.includes(tc.name));

    if (allIndependent) {
      state.phase = "executing";
      yield { type: "phase", phase: "executing" };
      const parallelParams = toolCalls.map(tc => ({ tc, params: JSON.parse(tc.arguments) as Record<string, unknown> }));
      for (const { tc, params } of parallelParams) yield { type: "tool_call", name: tc.name, params };

      const timeoutResult = { success: false, data: null, error: '工具执行超时', errorCategory: 'transient' as const, recoverable: true };

      const parallelResults = await Promise.race([
        Promise.all(parallelParams.map(({ tc, params }) =>
          executeTool(tc.name, params).catch(err => ({ success: false, data: null, error: err instanceof Error ? err.message : "Tool error", errorCategory: "transient" as const, recoverable: true }))
        )),
        new Promise<typeof timeoutResult[]>((resolve) => setTimeout(() => resolve(parallelParams.map(() => ({ ...timeoutResult }))), 30_000)),
      ]);

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const params = parallelParams[i].params;
        const paramsKey = JSON.stringify(params);
        const toolResult = parallelResults[i];
        const formatted = formatToolResult(toolResult, tc.name);

        yield { type: "tool_result", name: tc.name, result: formatted, success: toolResult.success, data: toolResult.data, uiPayload: (toolResult as ToolResult).uiPayload };
        if (!toolResult.success) yield { type: "tool_error", name: tc.name, error: toolResult.error || "未知错误", recoverable: toolResult.recoverable !== false };

        const category = resolveErrorCategory(toolResult);
        const action = ERROR_CATEGORY_ACTIONS[category];
        if (action.degradeToUser) {
          const errorObs = `[TOOL_ERROR tool=${tc.name} category=${category}] ${toolResult.error || "操作失败"}\n\n请基于此错误告知用户发生了什么，并给出具体的下一步建议。`;
          ctx.push({ role: "user", content: errorObs });
          forceTextOnly = true;
        } else {
          if (action.autoRetry) autoRetryCount++; else autoRetryCount = 0;
          // Terminal export tools: don't feed content back to LLM context — just confirm download
          if (tc.name === "export_file" || tc.name === "download_report_pdf") {
            const d = (toolResult.data as { filename?: string }) || {};
            ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->已导出文件: ${d.filename || "download"}。用户设备已自动下载，你不需要再提下载操作。` });
          } else {
            const catHints: Record<ErrorCategory, string> = { ok: "", transient: "\n<!-- ⚠️ 请换参数重试。 -->", permanent: "", need_user_input: "" };
            // Parallel path: aggressive cap (500 chars) — LLM just needs to know which results to dig into
            const ctxCap = 500;
            const llmText = getLLMContext(toolResult, tc.name);
            const capped = llmText.length > ctxCap ? llmText.slice(0, ctxCap) + "\n<!-- 并行结果截断，需要详情的工具结果请在下一轮单读 -->" : llmText;
            ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->\n${capped}${catHints[category]}\n\n【请基于以上工具返回数据进行分析。】` });
          }
        }
        intermediateSteps.push({ tool: tc.name, params: paramsKey, category, summary: toolResult.success ? formatted.slice(0, 100) : (toolResult.error || "失败").slice(0, 100) });
        recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
        if (recentCalls.length > 5) recentCalls.shift();
        state.contextSize = estimateTokens(ctx);
      }
      // Push summary after parallel batch
      if (toolCalls.length > 1) {
        ctx.push({ role: "user", content: `<!-- system -->并行调用了 ${toolCalls.length} 个工具。如果需要某个工具的完整结果，请单独调用该工具。现在请基于已有数据继续分析。` });
      }
      firstIteration = false;
      continue; // Skip the serial for loop below
    }

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
          toolResult = { success: false, data: null, error: execErr instanceof Error ? execErr.message : "Tool execution error", errorCategory: "transient" as const };
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
                // Inject real reportNum into finalData so formatResult uses it
                const d = finalData;
                const reportNum = persistJson.reportNum || 0;
                (d as Record<string, unknown>).reportNum = reportNum;
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

          formatted = formatToolResult({ success: true, data: finalData, errorCategory: "ok" as const }, tc.name);
          yield { type: "tool_result", name: tc.name, result: formatted, success: true, data: finalData, uiPayload: toolResult.uiPayload };

          // Push formatted result to context for LLM summary in next iteration
          if (tc.name === "export_file" || tc.name === "download_report_pdf") {
            const d = (finalData as { filename?: string }) || {};
            ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->已导出文件: ${d.filename || "download"}。用户设备已自动下载。` });
          } else {
            const llmText2 = getLLMContext(toolResult, tc.name);
            ctx.push({
              role: "user",
              content: `<!-- tool:${tc.name} result -->\n${llmText2}\n\n【请基于以上工具返回的数据进行深度分析和扩容解释。不要仅复述数据——要分析原因、风险判断、面试追问策略和行动建议。】`,
            });
            // If a report was persisted, also push the reportNum so LLM can retrieve it later
            if ((finalData as Record<string, unknown>).reportNum) {
              ctx.push({
                role: "user",
                content: `<!-- system -->评估报告已保存，报告编号: ${(finalData as Record<string, unknown>).reportNum}。当用户说"看完整报告""展开报告"时，请调用 get_report_detail 并传入此报告编号。`,
              });
            }
          }
          state.contextSize = estimateTokens(ctx);
          state.consecutiveFailures = 0;
          recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
          if (recentCalls.length > 5) recentCalls.shift();
          continue; // Skip the normal post-tool logic below
        }

        // ── Non-streaming tool: existing logic ──
        formatted = formatToolResult(toolResult, tc.name);
      }

      yield { type: "tool_result", name: tc.name, result: formatted, success: toolResult.success, data: toolResult.data, uiPayload: toolResult.uiPayload };

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

      // ── Error category dispatch (replaces qualityHint string splicing) ──
      const category = resolveErrorCategory(toolResult);
      const action = ERROR_CATEGORY_ACTIONS[category];

      if (action.degradeToUser) {
        // Anthropic pattern: errors are data, not exit signals.
        // Send the error as an Observation so the model can tell the user naturally.
        const errorObs = `[TOOL_ERROR tool=${tc.name} category=${category}] ${toolResult.error || "操作失败"}\n\n请基于此错误告知用户发生了什么，并给出具体的下一步建议。`;
        ctx.push({ role: "user", content: errorObs });
        state.contextSize = estimateTokens(ctx);
        forceTextOnly = true;
        intermediateSteps.push({ tool: tc.name, params: paramsKey, category, summary: (toolResult.error || "操作失败").slice(0, 100) });
        continue; // Let the model process the error in next iteration — DO NOT cache
      }

      // Only cache successful / non-degraded results
      recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
      if (recentCalls.length > 5) recentCalls.shift();

      if (action.autoRetry) {
        autoRetryCount++;
      } else {
        autoRetryCount = 0;
      }

      // Accumulate structured step record (LangChain pattern)
      intermediateSteps.push({
        tool: tc.name,
        params: paramsKey,
        category,
        summary: toolResult.success ? (formatted.slice(0, 100)) : (toolResult.error || "失败").slice(0, 100),
      });

      // Still build quality context for the LLM (lightweight, based on category)
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
        ctx.push({
          role: "user",
          content: `<!-- tool:${tc.name} result -->\n${getLLMContext(toolResult, tc.name)}${hint}\n\n【请基于以上工具返回的数据进行深度分析和扩容解释。不要仅复述数据——要分析原因、风险判断、面试追问策略和行动建议。】`,
        });
      }
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

  // Max iterations — force respond with structured summary (LangChain pattern)
  if (state.iteration >= config.maxIterations && state.phase !== "responding") {
    state.phase = "responding";
    yield { type: "phase", phase: "responding" };
    if (intermediateSteps.length > 0) {
      const lines = intermediateSteps.map(s => `- ${s.tool}: ${s.summary} [${s.category}]`);
      yield { type: "text", content: `已尝试 ${intermediateSteps.length} 次工具调用，未能完成任务。以下是尝试记录：\n${lines.join("\n")}\n\n请重新描述你的需求，或换个方式提问。` };
    } else {
      yield { type: "text", content: "达到处理上限，请重新提问。" };
    }
  }

  yield { type: "done" };
}
