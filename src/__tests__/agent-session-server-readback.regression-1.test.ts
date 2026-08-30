import { describe, expect, it, vi } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";

const localGetMock = vi.hoisted(() => vi.fn());
const localPutMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  default: {
    chatSessions: {
      get: localGetMock,
      put: localPutMock,
    },
  },
}));

describe("Agent server-authoritative session read-back regressions", () => {
  it("prefers the server session after a durable run reaches a terminal state", async () => {
    localPutMock.mockResolvedValue(undefined);
    localGetMock.mockResolvedValue({
      id: 74,
      title: "旧缓存",
      messages: [{ role: "assistant", content: "旧的流式内容" }],
      createdAt: "2026-08-28T09:00:00.000Z",
      updatedAt: "2026-08-28T09:00:00.000Z",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 74,
          title: "线上会话",
          messages_json: JSON.stringify([{
            role: "assistant",
            content: "Worker 已完成并持久化",
            timestamp: "2026-08-28T09:01:00.000Z",
          }]),
          created_at: "2026-08-28T09:00:00.000Z",
          updated_at: "2026-08-28T09:01:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getSession } = await import("@/lib/agent/sessions");
    const session = await getSession(74, { preferServer: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/74", { cache: "no-store" });
    expect(session?.messages).toEqual([
      expect.objectContaining({ content: "Worker 已完成并持久化" }),
    ]);
    expect(localPutMock).toHaveBeenCalled();
  });

  it("does not persist hidden bootstrap instructions into the user transcript", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-interview-bootstrap" },
      {
        requestId: "request-interview-bootstrap",
        conversationId: 74,
        taskType: "interview_coaching",
        agentId: "interview",
        input: {
          content: "开始模拟面试：请根据当前面试准备快照直接出第一题，不要先解释。",
          persistInConversation: false,
        },
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-interview-bootstrap" });
    const saved: Array<Array<{ role: string; content: string }>> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        saved.push(messages);
      },
      orchestrate: async function* () {
        yield { type: "text", content: "请介绍一次你通过数据推动产品优化的经历。" };
        yield { type: "done" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ outcome: "succeeded" });

    expect(saved.length).toBeGreaterThanOrEqual(1);
    expect(saved.at(-1)).toEqual([
      expect.objectContaining({ role: "assistant", content: "请介绍一次你通过数据推动产品优化的经历。" }),
    ]);
    expect(JSON.stringify(saved)).not.toContain("开始模拟面试：请根据当前面试准备快照直接出第一题，不要先解释。");
  });
});
