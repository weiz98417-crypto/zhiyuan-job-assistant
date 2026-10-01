import { describe, expect, it, vi } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import * as intentEnvelope from "@/lib/agent/intent-envelope";

/** Spec 21 写侧顺序回归锚点：送达校验的前提是「succeeded 时对话消息已落库」
 *  （引擎 finalize 里 saveConversation await 于返回之前，durable-orchestrator-engine.ts:789
 *  先于后续终态流转）。若有人把 save 改成 fire-and-forget，本测试用 25ms 真延迟让
 *  「runOnce 已返回但消息未落库」可见。 */
describe("Spec 21 anchor: conversation persists before the engine reports success", () => {
  it("has the assistant text readable the moment the run resolves succeeded", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const constraints = {
      writePolicy: "allowed" as const,
      noProfileWrite: false,
      noResumeWrite: false,
      noReferenceResumeWrite: false,
    };
    const resolveEnvelope = vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({
      kind: "resolved",
      source: "llm",
      envelope: {
        primaryTask: "general_chat",
        constraints,
        referencedMaterials: [],
        confidence: "high",
        audit: ["envelope.llm:general_chat"],
      },
    });
    let savedConversation: Array<{ role: string; content: string }> = [];
    const orchestrate = vi.fn(async function* () {
      yield { type: "text", content: "本周岗位精选 Top 5 如下……" };
    });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        savedConversation = messages;
      },
      orchestrate,
    });
    const worker = new AgentWorker({ workerId: "worker-order-anchor", runtime, engine });

    try {
      const run = await runtime.createRun(
        { userId: "user-order-anchor" },
        {
          requestId: "request-order-anchor",
          conversationId: 4242,
          taskType: "job_digest",
          agentId: "general",
          input: { content: "[系统] 每周岗位精选" },
          contract: createAgentTaskContract({ taskType: "job_digest", target: "每周岗位精选" }),
        },
      );
      expect((await worker.runOnce())?.status).toBe("succeeded");
      expect(savedConversation.some((message) => message.role === "assistant" && message.content.includes("岗位精选"))).toBe(true);
      // 引擎返回后，读回路径立即可见该 assistant 消息（送达校验的读取前提）。
      const receipt = await runtime.getRunByRequestId({ userId: "user-order-anchor" }, "request-order-anchor");
      expect(receipt?.id).toBe(run.run.id);
    } finally {
      resolveEnvelope.mockRestore();
    }
  });
});
