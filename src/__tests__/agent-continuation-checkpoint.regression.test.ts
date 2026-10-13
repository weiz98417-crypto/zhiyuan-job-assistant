import { describe, expect, it } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
  type ConsumeAgentRunInputsCommand,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { createAgentTaskContract } from "@/lib/agent/task-contract";

describe("Agent continuation checkpoint recovery", () => {
  it("recovers a correction after a consume failure without duplicating the accepted input", async () => {
    class InterruptedInputStore extends InMemoryAgentRunStore {
      private interrupted = false;

      override async consumeInputs(command: ConsumeAgentRunInputsCommand): Promise<void> {
        if (!this.interrupted) {
          this.interrupted = true;
          throw new Error("database unavailable before input acknowledgement");
        }
        return super.consumeInputs(command);
      }
    }
    const principal = { userId: "continuation-owner" };
    const runtime = new DurableAgentRunService(new InterruptedInputStore());
    const created = await runtime.createRun(principal, {
      requestId: "accepted-correction",
      conversationId: 15,
      taskType: "general_chat",
      agentId: "general",
      input: { content: "纠正：我是在学习 React，还没有熟练掌握。" },
      contract: createAgentTaskContract({ taskType: "general_chat", target: "理解我的纠正" }),
    });
    const run = await runtime.claimNextRun({ workerId: "continuation-worker" });
    let modelInputs: Array<{ role: string; content: string }> = [];
    let transcript: Array<{ role: string; content: string }> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => transcript,
      saveConversation: async (_principal, _conversationId, messages) => {
        transcript = messages;
      },
      orchestrate: async function* (input) {
        modelInputs = input.messages;
        yield { type: "text", content: "已按你的纠正理解为正在学习 React。" };
      },
    });
    await expect(engine.execute({ run: run!, checkpoint: null, signal: new AbortController().signal }))
      .rejects.toThrow("database unavailable");
    const checkpoint = await runtime.getLatestCheckpoint(principal, created.run.id);
    expect(await runtime.listPendingInputs(principal, created.run.id)).toHaveLength(1);
    await engine.execute({ run: run!, checkpoint, signal: new AbortController().signal });

    expect(modelInputs.filter((message) => message.role === "user" && message.content.startsWith("纠正："))).toHaveLength(1);
    expect(transcript.filter((message) => message.role === "user")).toHaveLength(1);
    expect(await runtime.listPendingInputs(principal, created.run.id)).toEqual([]);
    expect((await runtime.getRun(principal, created.run.id))?.id).toBe(created.run.id);
  });
});
