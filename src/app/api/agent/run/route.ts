import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { orchestrateGen } from "@/lib/agent/orchestrator";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import type { SSEEvent } from "@/lib/agent/loop/types";
import { getAgentById } from "@/lib/agent/registry";
import registry from "@/lib/agent/tools";
import type { AgentTaskContract } from "@/lib/agent/task-contract";
import type { InterviewRebindAction } from "@/lib/agent/interview-rebind-policy";
import type { InterviewSessionState } from "@/types";

export const maxDuration = 180; // 3 minutes for complex agents

function sse(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body as {
      messages?: { role: string; content: string; images?: string[] }[];
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "消息列表不能为空" }, { status: 400 });
    }

    const userMessage = messages[messages.length - 1]?.content || "";
    const directInput = body as {
      systemPrompt?: string;
      agentId?: string;
      runId?: string;
      interviewState?: InterviewSessionState;
      interviewRebindAction?: InterviewRebindAction;
      taskContract?: AgentTaskContract | null;
    };
    const directAgent = directInput.agentId ? getAgentById(directInput.agentId) : undefined;
    const directMode = Boolean(directInput.systemPrompt && directAgent);
    const currentUser = directMode ? await currentUserOrNull() : null;
    if (directMode && !currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const encoder = new TextEncoder();
    let aborted = false;

    const stream = new ReadableStream({
      async start(controller) {
        request.signal.addEventListener("abort", () => { aborted = true; });

        try {
          const toolWhitelist = directAgent?.toolNames.length
            ? directAgent.toolNames
            : registry.toOpenAITools().map((tool) => tool.function.name);
          const runner = directMode
            ? agentLoopServer({
                agent: directAgent,
                systemPrompt: directInput.systemPrompt!,
                messages,
                tools: registry.toOpenAITools(toolWhitelist),
                signal: request.signal,
                interviewState: directInput.interviewState,
                interviewRebindAction: directInput.interviewRebindAction,
                taskContract: directInput.taskContract,
                executionContext: {
                  principal: { userId: currentUser!.userId },
                  runId: directInput.runId || `legacy-${randomUUID()}`,
                  allowlist: toolWhitelist,
                  signal: request.signal,
                },
              })
            : orchestrateGen(userMessage, {
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

async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
