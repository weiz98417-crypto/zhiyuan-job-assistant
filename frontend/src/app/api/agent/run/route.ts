import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/agent/orchestrator";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import type { SSEEvent } from "@/lib/agent/loop/types";

export const maxDuration = 180; // 3 minutes for complex agents

function sse(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body as {
      messages?: { role: string; content: string }[];
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "消息列表不能为空" }, { status: 400 });
    }

    const userMessage = messages[messages.length - 1]?.content || "";

    // Orchestrate: classify intent, build prompt, tool whitelist
    const { systemPrompt, toolWhitelist, tools } = await orchestrate(userMessage, {
      sessionId: null,
      messages,
    });

    const encoder = new TextEncoder();
    let aborted = false;

    const stream = new ReadableStream({
      async start(controller) {
        request.signal.addEventListener("abort", () => { aborted = true; });

        try {
          const runner = agentLoopServer(systemPrompt, messages, undefined, tools, toolWhitelist);
          for await (const event of runner) {
            if (aborted) break;
            controller.enqueue(encoder.encode(sse(event)));
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
