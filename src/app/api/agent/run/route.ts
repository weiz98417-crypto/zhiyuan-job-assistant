import { NextResponse } from "next/server";
import { orchestrateGen } from "@/lib/agent/orchestrator";
import type { SSEEvent } from "@/lib/agent/loop/types";

export const maxDuration = 180; // 3 minutes for complex agents

function sse(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * M1 (ADR-0026): the directMode legacy loop (browser-supplied system prompt +
 * agent id → agentLoopServer) is deleted. The worker owns all production run
 * execution; this route now only serves the eval-script orchestrateGen bypass
 * (scripts/eval-agent.mjs), which never runs in the user request path.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const directInput = body as { systemPrompt?: string; agentId?: string };
    if (directInput.systemPrompt || directInput.agentId) {
      return NextResponse.json(
        { success: false, error: "directMode 已随 M1 cutover 移除：所有 Agent Run 由 durable worker 执行（ADR-0026）。" },
        { status: 410 },
      );
    }

    const { messages } = body as {
      messages?: { role: string; content: string; images?: string[] }[];
    };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "消息列表不能为空" }, { status: 400 });
    }
    const userMessage = messages[messages.length - 1]?.content || "";

    const encoder = new TextEncoder();
    let aborted = false;

    const stream = new ReadableStream({
      async start(controller) {
        request.signal.addEventListener("abort", () => { aborted = true; });

        try {
          const runner = orchestrateGen(userMessage, {
            sessionId: null,
            messages,
            signal: request.signal,
          });
          for await (const event of runner) {
            if (aborted) break;
            controller.enqueue(encoder.encode(sse(event as SSEEvent)));
          }
        } catch (err) {
          if (!aborted) {
            controller.enqueue(encoder.encode(sse({
              type: "text",
              content: `服务端错误: ${err instanceof Error ? err.message : "未知错误"}`,
            })));
            controller.enqueue(encoder.encode(sse({ type: "done" })));
          }
        } finally {
          if (!aborted) {
            try { controller.close(); } catch { /* already closed */ }
          }
        }
      },
      cancel() {
        aborted = true;
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ success: false, error: `Agent 运行失败: ${message}` }, { status: 500 });
  }
}
