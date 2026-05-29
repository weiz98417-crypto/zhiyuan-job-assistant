import { NextResponse } from "next/server";
import { getSkillBody } from "@/lib/agent/skill-loader";
import { llmRetry, LLMError } from "@/lib/llm-retry";

/* ── SSE helpers ── */

type SSEEvent = Record<string, unknown> & { type: string };

function sse(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/* ── DeepSeek streaming ── */

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";
const MAX_MESSAGES = 30;

async function callDeepSeekStream(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  apiKey: string,
): Promise<Response> {
  const truncated = messages.slice(-MAX_MESSAGES);
  return llmRetry(DEEPSEEK_API_URL, apiKey, {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...truncated,
    ],
    temperature: 0.7,
    max_tokens: 2000,
    stream: true,
    retries: 1,
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
  });
}

/* ── POST handler ── */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, mode } = body as {
      messages: { role: string; content: string }[];
      mode?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "消息列表不能为空" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "未配置 DEEPSEEK_API_KEY" }, { status: 500 });
    }

    // Route to appropriate skill based on mode
    const skillName = mode === "dingwei" ? "zhiyuan-dingwei"
      : mode === "execute" ? "zhiyuan-execute"
      : "zhiyuan-agent";
    const systemPrompt = getSkillBody(skillName);
    const encoder = new TextEncoder();

    // Stream text directly as SSE events
    const response = await callDeepSeekStream(systemPrompt, messages, apiKey);

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `AI 请求失败: ${response.status}` },
        { status: 502 },
      );
    }

    const isStreaming = (response.headers.get("content-type") || "").includes("text/event-stream");

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sse({ type: "phase", phase: "thinking" })));

        // ── Non-streaming fallback: llmRetry downgraded to stream:false ──
        if (!isStreaming) {
          try {
            const json = await response.json();
            const content = json?.choices?.[0]?.message?.content;
            if (content) {
              controller.enqueue(encoder.encode(sse({ type: "phase", phase: "responding" })));
              controller.enqueue(encoder.encode(sse({ type: "text", content })));
            }
          } catch (err) {
            console.error("JSON parse error:", err);
          }
          controller.enqueue(encoder.encode(sse({ type: "done" })));
          controller.close();
          return;
        }

        // ── SSE streaming: line-buffer pattern ──
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        let lineBuf = "";
        let phaseSent = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            lineBuf += decoder.decode(value, { stream: true });
            const lines = lineBuf.split("\n");
            lineBuf = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  buffered += content;
                  if (buffered.length < 6) continue;
                  if (!phaseSent) {
                    controller.enqueue(encoder.encode(sse({ type: "phase", phase: "responding" })));
                    phaseSent = true;
                  }
                  controller.enqueue(encoder.encode(sse({ type: "text", content })));
                }
              } catch {
                /* skip */
              }
            }
          }
          controller.enqueue(encoder.encode(sse({ type: "done" })));
        } catch (err) {
          console.error("Stream error:", err);
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Agent chat error:", message);
    return NextResponse.json(
      { success: false, error: `Agent 请求失败: ${message}` },
      { status: 500 },
    );
  }
}
