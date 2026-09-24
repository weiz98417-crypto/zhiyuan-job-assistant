import { describe, expect, it } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";

describe("durable run continuation input admission", () => {
  it("rejects input submitted while a worker owns a running run", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "user-input-race" };
    const created = await runtime.createRun(principal, {
      requestId: "initial-request",
      conversationId: 701,
      taskType: "general_chat",
      agentId: "general",
      input: { content: "开始一个任务" },
    });

    await runtime.claimNextRun({ workerId: "worker-input-race" });

    await expect(runtime.submitInput(
      principal,
      created.run.id,
      "late-continuation",
      { content: "运行中追加的消息" },
    )).rejects.toThrow("not accepting continuation input");

    expect(await runtime.listPendingInputs(principal, created.run.id)).toHaveLength(1);
  });
});
