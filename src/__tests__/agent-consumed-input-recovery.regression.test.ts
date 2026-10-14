import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { DurableAgentRunService, InMemoryAgentRunStore } from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import * as intentEnvelope from "@/lib/agent/intent-envelope";
import type { ExecutionConversationMessage } from "@/lib/agent/runtime/execution-session-service";

afterEach(() => vi.restoreAllMocks());

describe("durable consumed input recovery", () => {
  it("recovers from interruption after consumption and replays the stored completion exactly once", async () => {
    const principal = { userId: "consumed-input-owner" };
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const source = "岗位目标是 AI 产品经理，我的真实经验是两年数据产品工作。";
    const created = await runtime.createRun(principal, { requestId: "consumed-input-request", conversationId: 71,
      taskType: "general_chat", agentId: "general", input: { content: source },
      contract: createAgentTaskContract({ taskType: "general_chat", target: source }) });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({ kind: "resolved", source: "fast_path",
      envelope: { primaryTask: "general_chat", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "allowed", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } } });
    let transcript: ExecutionConversationMessage[] = [];
    let attempts = 0;
    const model = vi.fn(async function* (input: { messages: ExecutionConversationMessage[]; runId: string }) {
      attempts += 1;
      expect(input.runId).toBe(created.run.id);
      expect(input.messages.filter((message) => message.role === "user" && message.content === source)).toHaveLength(1);
      expect(await runtime.listPendingInputs(principal, created.run.id)).toEqual([]);
      if (attempts === 1) {
        yield { type: "text" as const, content: "这是一段未完成输出" };
        throw new Error("provider connection reset after consumed input");
      }
      yield { type: "text" as const, content: "已依据两年数据产品经验继续讨论 AI 产品经理的目标。" };
    });
    const createEngine = () => new DurableOrchestratorExecutionEngine({ runtime, orchestrate: model,
      loadConversation: async () => transcript,
      saveConversation: async (_principal, _conversation, messages) => { transcript = messages; } });
    const worker = (workerId: string) => new AgentWorker({ workerId, runtime, engine: createEngine() });
    expect(await worker("consumed-worker-1").runOnce()).toMatchObject({ id: created.run.id, status: "queued" });
    expect(await runtime.listPendingInputs(principal, created.run.id)).toEqual([]);
    const interrupted = await runtime.getLatestCheckpoint(principal, created.run.id);
    expect(interrupted?.context.interruptedModelOutput).toMatchObject({ text: "这是一段未完成输出" });
    expect(await worker("consumed-worker-2").runOnce()).toMatchObject({ id: created.run.id, status: "succeeded" });
    const completed = await runtime.getLatestCheckpoint(principal, created.run.id);
    const ownerRun = await runtime.getRun(principal, created.run.id);
    await createEngine().execute({ run: { ...ownerRun!, ownerId: "consumed-worker-2" }, checkpoint: completed, signal: new AbortController().signal });
    expect(model).toHaveBeenCalledTimes(2);
    expect(transcript.filter((message) => message.role === "user" && message.content === source)).toHaveLength(1);
    expect(transcript.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(transcript.some((message) => message.content.includes("未完成输出"))).toBe(false);
    const events = await runtime.listEvents(principal, created.run.id, 0);
    expect(events.filter((event) => event.type === "run.model_output_complete")).toHaveLength(1);
    expect(events.filter((event) => event.type === "run.ui_event" && (event.payload.event as { type?: string })?.type === "text")).toHaveLength(1);
  });
});
