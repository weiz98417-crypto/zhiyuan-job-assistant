import type { SSEEvent } from "@/lib/agent/loop/types";
import type { InterviewRebindAction } from "@/lib/agent/interview-rebind-policy";
import type { AgentTaskContract } from "@/lib/agent/task-contract";
import type { InterviewSessionState } from "@/types";

type RemoteLoopMessage = { role: string; content: string; images?: string[] };

export interface RemoteAgentLoopContext {
  agentId: string;
  runId?: string;
  interviewState?: InterviewSessionState;
  interviewRebindAction?: InterviewRebindAction;
  taskContract?: AgentTaskContract | null;
}

export async function* agentLoopRemote(
  systemPrompt: string,
  messages: RemoteLoopMessage[],
  signal: AbortSignal | undefined,
  runtimeContext: RemoteAgentLoopContext,
): AsyncGenerator<SSEEvent> {
  const response = await fetch("/api/agent/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemPrompt,
      messages,
      agentId: runtimeContext.agentId,
      runId: runtimeContext.runId,
      interviewState: runtimeContext.interviewState,
      interviewRebindAction: runtimeContext.interviewRebindAction,
      taskContract: runtimeContext.taskContract,
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Remote agent loop failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const event = parseSseFrame(frame);
      if (event) yield event;
    }
  }
  buffer += decoder.decode();
  const finalEvent = parseSseFrame(buffer);
  if (finalEvent) yield finalEvent;
}

function parseSseFrame(frame: string): SSEEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  return JSON.parse(data) as SSEEvent;
}
