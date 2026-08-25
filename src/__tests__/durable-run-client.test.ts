import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDurableAgentRunClient,
  DurableRunOwnershipUnknownError,
  getDurableAgentRunClient,
  listActiveDurableAgentRunsClient,
  observeDurableAgentRun,
  pollDurableAgentRunEventsClient,
  requestDurableAgentRunCancelClient,
  submitDurableAgentRunInputClient,
} from "@/lib/agent/runtime/durable-run-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Durable Agent Run browser adapter", () => {
  it("submits an idempotent create command and accepts server-side ownership", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      enabled: true,
      data: {
        run: { id: "run-1", status: "queued", eventCursor: 1 },
        replayed: false,
        assignment: { mode: "worker_all", owner: "worker", shadow: false, cohortBucket: 5 },
      },
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDurableAgentRunClient({
      requestId: "request-1",
      conversationId: 12,
      taskType: "resume_query",
      agentId: "resume",
      input: { content: "读取我的简历" },
      contract: { target: "skills" },
    });

    expect(result?.assignment.owner).toBe("worker");
    expect(result?.run?.id).toBe("run-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/runs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        requestId: "request-1",
        conversationId: 12,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
        contract: { target: "skills" },
      }),
    }));
  });

  it("retries an unconfirmed create with the same request id", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        enabled: true,
        data: {
          run: { id: "run-1", status: "queued", eventCursor: 1 },
          replayed: true,
          assignment: { mode: "worker_all", owner: "worker", shadow: false, cohortBucket: 5 },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDurableAgentRunClient({
      requestId: "request-stable",
      conversationId: 12,
      taskType: "resume_query",
      agentId: "resume",
      input: { content: "读取我的简历" },
    });

    expect(result?.run?.id).toBe("run-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[1]?.body)).toEqual([
      expect.stringContaining('"requestId":"request-stable"'),
      expect.stringContaining('"requestId":"request-stable"'),
    ]);
  });

  it("never treats an unconfirmed owner as permission to run locally", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection reset")));

    await expect(createDurableAgentRunClient({
      requestId: "request-unknown",
      conversationId: 12,
      taskType: "resume_query",
      agentId: "resume",
      input: { content: "读取我的简历" },
    })).rejects.toBeInstanceOf(DurableRunOwnershipUnknownError);
  });

  it("queues follow-up input on the existing Run", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { run: { id: "run-1", status: "queued" }, input: { id: 2 }, replayed: false },
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitDurableAgentRunInputClient("run-1", {
      requestId: "input-1",
      input: { content: "补充岗位范围" },
    });

    expect(result?.run.status).toBe("queued");
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/runs/run-1/inputs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ requestId: "input-1", input: { content: "补充岗位范围" } }),
    }));
  });

  it("requests cancellation as a durable command", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { run: { id: "run-1", status: "cancel_requested" } },
    }), { status: 202, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const run = await requestDurableAgentRunCancelClient("run-1", "cancel-1");

    expect(run?.status).toBe("cancel_requested");
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/runs/run-1/cancel", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ requestId: "cancel-1" }),
    }));
  });

  it("reads active snapshots and resumes event polling from a cursor", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/agent/runs?conversationId=12&activeOnly=true") {
        return Response.json({ success: true, enabled: true, data: [{ id: "run-1", status: "running" }] });
      }
      if (url === "/api/agent/runs/run-1") {
        return Response.json({ success: true, data: { run: { id: "run-1", status: "running", eventCursor: 4 } } });
      }
      if (url === "/api/agent/runs/run-1/events?after=3") {
        return Response.json({ success: true, data: { events: [{ sequence: 4 }], cursor: 4 } });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const runs = await listActiveDurableAgentRunsClient(12);
    const run = await getDurableAgentRunClient("run-1");
    const batch = await pollDurableAgentRunEventsClient("run-1", 3);

    expect(runs[0]?.id).toBe("run-1");
    expect(run?.eventCursor).toBe(4);
    expect(batch?.cursor).toBe(4);
  });

  it("falls back from SSE to cursor polling without cancelling the Run", async () => {
    let source: FakeEventSource | null = null;
    class FakeEventSource {
      onerror: (() => void) | null = null;
      readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
      readonly close = vi.fn();

      constructor(readonly url: string) {
        source = this;
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      emit(type: string, event: Record<string, unknown>) {
        for (const listener of this.listeners.get(type) || []) {
          listener(new MessageEvent(type, { data: JSON.stringify(event) }));
        }
      }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({
      success: true,
      data: {
        events: [{ runId: "run-1", sequence: 5, type: "run.status_changed", payload: { status: "succeeded" } }],
        cursor: 5,
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const received: number[] = [];

    const stop = observeDurableAgentRun("run-1", {
      afterCursor: 3,
      pollIntervalMs: 5,
      onEvents: (events) => received.push(...events.map((event) => event.sequence)),
    });
    source!.emit("run.ui_event", {
      runId: "run-1",
      sequence: 4,
      type: "run.ui_event",
      payload: { event: { type: "text", content: "处理中" } },
    });
    source!.onerror?.();

    await vi.waitFor(() => expect(received).toEqual(expect.arrayContaining([4, 5])));
    stop();

    expect(fetchMock).toHaveBeenCalledWith("/api/agent/runs/run-1/events?after=4", expect.any(Object));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/cancel"))).toBe(false);
  });
});
