import { NextResponse } from "next/server";
import { ZHIPU_API_URL, ZHIPU_FALLBACK_MODEL } from "@/lib/zhipu";

const MAX_MESSAGES = 10;
const MAX_MSG_LEN = 2000;
const MAX_TOTAL_CHARS = 15000;

function sse(event: { type: string } & Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function isClosedStreamError(error: unknown): boolean {
  const maybeError = error as { code?: unknown; message?: unknown } | null;
  const message = typeof maybeError?.message === "string" ? maybeError.message : "";
  return maybeError?.code === "ERR_INVALID_STATE" || /controller is already closed|invalid state/i.test(message);
}

function isExpectedStreamStop(error: unknown): boolean {
  if (isClosedStreamError(error)) return true;
  const maybeError = error as { name?: unknown; code?: unknown; message?: unknown } | null;
  const name = typeof maybeError?.name === "string" ? maybeError.name : "";
  const code = typeof maybeError?.code === "string" ? maybeError.code : "";
  const message = typeof maybeError?.message === "string" ? maybeError.message : "";
  return name === "AbortError" || code === "ABORT_ERR" || /aborted|cancelled|canceled/i.test(message);
}

// Model fallback chain: DeepSeek → Zhipu
const MODEL_CHAIN = [
  { model: "deepseek-v4-flash", url: "https://api.deepseek.com/chat/completions", keyEnv: "DEEPSEEK_API_KEY" },
  { model: ZHIPU_FALLBACK_MODEL, url: ZHIPU_API_URL, keyEnv: "ZHIPU_API_KEY" },
];

async function fetchWithFallback(
  bodyFn: (model: string) => Record<string, unknown>,
): Promise<{ response: Response; modelUsed: string }> {
  let lastError = "";
  for (const { model, url, keyEnv } of MODEL_CHAIN) {
    const apiKey = process.env[keyEnv];
    if (!apiKey) continue; // Skip if no key configured

    const body = bodyFn(model);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (response.ok) return { response, modelUsed: model };
      lastError = `${response.status}`;
      if (response.status !== 429 && response.status !== 503) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`All models failed. Last error: ${lastError}`);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { systemPrompt, messages, tools } = body as {
      systemPrompt?: string;
      messages?: { role: string; content: string; tool_call_id?: string; toolName?: string }[];
      tools?: Array<{ type: string; function: { name: string; description: string; parameters: object } }>;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "消息列表不能为空" }, { status: 400 });
    }

    console.log("[think] msgs:", messages.length, "hasTools:", !!(tools?.length));
    console.log("[think] systemPrompt length:", systemPrompt?.length || 0);

    if (!process.env.DEEPSEEK_API_KEY && !process.env.ZHIPU_API_KEY) {
      return NextResponse.json({ success: false, error: "未配置任何 LLM API Key" }, { status: 500 });
    }

    // Sanitize messages
    let truncated = messages.slice(-MAX_MESSAGES).map((m) => {
      let role = m.role as string;
      let content = typeof m.content === "string" ? m.content : "";
      if (role === "tool" && !(m as Record<string,unknown>).tool_call_id) {
        role = "user";
        content = `<!-- tool_result:${(m as Record<string,unknown>).toolName || "unknown"} -->\n${content}`;
      }
      content = content.slice(0, MAX_MSG_LEN);
      return { role, content, ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}) };
    });
    let totalChars = truncated.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0);
    while (totalChars > MAX_TOTAL_CHARS && truncated.length > 2) {
      truncated = truncated.slice(1);
      totalChars = truncated.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0);
    }

    // Use fallback chain: DeepSeek → Zhipu
    let response: Response;
    let modelUsed: string;
    try {
      const result = await fetchWithFallback((m) => ({
        model: m,
        messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), ...truncated],
        ...(tools?.length ? { tools } : {}),
        temperature: 0.7,
        max_tokens: 16384,
        stream: true,
      }));
      response = result.response;
      modelUsed = result.modelUsed;
      console.log("[think] using model:", modelUsed);
    } catch (err) {
      console.error("All models failed:", err);
      return NextResponse.json({ success: false, error: "所有模型均不可用" }, { status: 502 });
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`${modelUsed} error:`, response.status, errText.slice(0, 500));
      return NextResponse.json(
        { success: false, error: `${modelUsed} API ${response.status}: ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();

    let closed = false;
    let downstreamCancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        const shouldStop = () => closed || downstreamCancelled || request.signal.aborted;
        const safeEnqueue = (event: { type: string } & Record<string, unknown>): boolean => {
          if (shouldStop()) return false;
          try {
            controller.enqueue(encoder.encode(sse(event)));
            return true;
          } catch (err) {
            closed = true;
            if (!isClosedStreamError(err)) {
              console.error("Think stream enqueue error:", err);
            }
            return false;
          }
        };
        const safeClose = () => {
          if (closed || downstreamCancelled) return;
          closed = true;
          try {
            controller.close();
          } catch (err) {
            if (!isClosedStreamError(err)) {
              console.error("Think stream close error:", err);
            }
          }
        };
        const cancelUpstream = async (reason?: unknown) => {
          downstreamCancelled = true;
          closed = true;
          try {
            await reader?.cancel(reason);
          } catch (err) {
            if (!isExpectedStreamStop(err)) {
              console.error("Think upstream cancel error:", err);
            }
          }
        };
        const abortHandler = () => {
          void cancelUpstream(request.signal.reason);
        };
        request.signal.addEventListener("abort", abortHandler, { once: true });

        const decoder = new TextDecoder();
        let buffered = "";
        let phaseSent = false;

        // Accumulate tool_call fragments by index (native function calling)
        const toolCallFragments = new Map<number, { id: string; name: string; arguments: string }>();
        let finishReason = "";
        let lineBuf = "";

        try {
          if (!safeEnqueue({ type: "phase", phase: "thinking" })) return;

          reader = response.body!.getReader();
          while (true) {
            if (shouldStop()) break;
            const { done, value } = await reader.read();
            if (done || shouldStop()) break;
            lineBuf += decoder.decode(value, { stream: true });
            const lines = lineBuf.split("\n");
            lineBuf = lines.pop() || "";
            for (const line of lines) {
              if (shouldStop()) break;
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                // Capture finish_reason from the last chunk (model's signal to stop or continue)
                const fr = parsed.choices?.[0]?.finish_reason;
                if (fr) finishReason = fr;

                // Handle native tool_calls deltas
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

                // Handle text content
                const content = delta?.content;
                if (content) {
                  buffered += content;
                  if (buffered.length <= 100 && buffered.length + content.length >= 6) {
                    console.log("[think] first content:", buffered.slice(0, 100));
                  }
                  if (!phaseSent && buffered.length < 6) continue;
                  if (!phaseSent) {
                    if (!safeEnqueue({ type: "phase", phase: "responding" })) break;
                    phaseSent = true;
                    if (!safeEnqueue({ type: "text", content: buffered })) break;
                  } else {
                    if (!safeEnqueue({ type: "text", content })) break;
                  }
                }
              } catch {
                /* skip */
              }
            }
          }

          // Drain remaining buffer lines (could contain tool_calls/finish_reason SSE)
          if (!shouldStop() && lineBuf.trim()) {
            for (const line of lineBuf.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const fr = parsed.choices?.[0]?.finish_reason;
                if (fr) finishReason = fr;
              } catch { /* skip */ }
            }
          }

          // Emit accumulated tool_calls at end of stream (before done)
          if (!shouldStop() && toolCallFragments.size > 0) {
            const toolCalls = Array.from(toolCallFragments.values());
            safeEnqueue({ type: "tool_calls", tool_calls: toolCalls });
          }
          // Emit finish_reason so the client loop knows whether to continue or stop (Anthropic stop_reason pattern)
          if (!shouldStop() && finishReason) {
            safeEnqueue({ type: "finish_reason", finish_reason: finishReason });
          }
          if (!shouldStop()) {
            safeEnqueue({ type: "done" });
          }
        } catch (err) {
          if (!shouldStop() && !isExpectedStreamStop(err)) {
            console.error("Think stream error:", err);
            safeEnqueue({ type: "error", error: "模型响应中断，请稍后重试。" });
            safeEnqueue({ type: "done" });
          }
        } finally {
          request.signal.removeEventListener("abort", abortHandler);
          try {
            reader?.releaseLock();
          } catch (err) {
            if (!isExpectedStreamStop(err)) {
              console.error("Think stream release error:", err);
            }
          }
          safeClose();
        }
      },
      async cancel(reason) {
        downstreamCancelled = true;
        closed = true;
        try {
          await reader?.cancel(reason);
        } catch (err) {
          if (!isExpectedStreamStop(err)) {
            console.error("Think response cancel error:", err);
          }
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Think proxy error:", message);
    return NextResponse.json(
      { success: false, error: `Think 代理失败: ${message}` },
      { status: 500 },
    );
  }
}
