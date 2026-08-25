import { describe, expect, it, vi } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";

describe("Agent Worker recovery", () => {
  it("requeues a transient provider failure and completes on the next safe attempt", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    let executions = 0;
    const engine = {
      execute: async () => {
        executions += 1;
        if (executions === 1) throw new Error("provider timeout");
        return { outcome: "succeeded" as const };
      },
    };

    await new AgentWorker({ workerId: "worker-a", runtime, engine }).runOnce();
    await new AgentWorker({ workerId: "worker-b", runtime, engine }).runOnce();
    const completed = await runtime.getRun({ userId: "user-1" }, created.run.id);

    expect({ executions, status: completed?.status }).toEqual({ executions: 2, status: "succeeded" });
  });

  it("resumes the original durable input after an orchestrator failure", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-resume-input" },
      {
        requestId: "request-resume-input",
        conversationId: 142,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的完整简历并总结优势" },
      },
    );
    const receivedInputs: string[] = [];
    const receivedContexts: string[][] = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: (input) => (async function* () {
        receivedInputs.push(input.content);
        receivedContexts.push(input.messages.map((message) => message.content));
        if (receivedInputs.length === 1) {
          yield { type: "error", message: "tool temporary issue" };
          return;
        }
        yield { type: "text", content: "已完成简历总结。" };
      })(),
    });

    await new AgentWorker({ workerId: "worker-input-a", runtime, engine }).runOnce();
    await new AgentWorker({ workerId: "worker-input-b", runtime, engine }).runOnce();
    const completed = await runtime.getRun({ userId: "user-resume-input" }, created.run.id);

    expect(receivedInputs).toEqual([
      "读取我的完整简历并总结优势",
      "读取我的完整简历并总结优势",
    ]);
    expect(receivedContexts[1]?.join("\n")).toContain("RECOVERY action=safe_tool_replan");
    expect(completed?.status).toBe("succeeded");
  });

  it("runs with bounded concurrency and drains without claiming more work", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    for (let index = 0; index < 3; index += 1) {
      await runtime.createRun(
        { userId: `user-${index}` },
        {
          requestId: `request-${index}`,
          conversationId: index + 1,
          taskType: "resume_query",
          agentId: "resume",
          input: { content: `读取简历 ${index}` },
        },
      );
    }
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    let executions = 0;
    const engine = {
      execute: async () => {
        executions += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return { outcome: "succeeded" as const };
      },
    };
    const worker = new AgentWorker({ workerId: "worker-a", runtime, engine });
    const running = worker.runForever({ concurrency: 2, pollIntervalMs: 5 });

    await vi.waitFor(() => expect(executions).toBe(2));
    worker.drain();
    releases.splice(0).forEach((release) => release());
    await running;

    expect(maxActive).toBe(2);
    expect(executions).toBe(2);
  });

  it("aborts a stalled model attempt at its deadline and requeues recovery", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-deadline" },
      {
        requestId: "request-deadline",
        conversationId: 99,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    const engine = {
      execute: async ({ signal }: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("provider timeout")), { once: true });
      }),
    };
    const worker = new AgentWorker({
      workerId: "worker-deadline",
      runtime,
      engine,
      attemptDeadlineMs: 10,
    });

    await worker.runOnce();
    const run = await runtime.getRun({ userId: "user-deadline" }, created.run.id);

    expect(run?.status).toBe("queued");
  });

  it("terminates after bounded provider recovery instead of requeueing forever", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-bounded" },
      {
        requestId: "request-bounded",
        conversationId: 100,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    let executions = 0;
    const engine = {
      execute: async () => {
        executions += 1;
        throw new Error("provider timeout");
      },
    };

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new AgentWorker({ workerId: `worker-${attempt}`, runtime, engine }).runOnce();
    }
    const run = await runtime.getRun({ userId: "user-bounded" }, created.run.id);

    expect({ executions, status: run?.status }).toEqual({ executions: 4, status: "failed" });
  });

  it("treats a Gate-committed Run as normal waiting instead of a stale-owner failure", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-gate-worker" },
      {
        requestId: "request-gate-worker",
        conversationId: 101,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "应用简历修改" },
      },
    );
    const engine = {
      execute: async ({ run }: { run: { id: string; fencingToken: number } }) => {
        await runtime.openGate({
          runId: run.id,
          workerId: "worker-gate",
          fencingToken: run.fencingToken,
          toolName: "apply_resume_edit_proposal",
          risk: "high",
          scopeHash: "scope-1",
          request: { proposalId: "proposal-1" },
        });
        return { outcome: "waiting_user" as const };
      },
    };

    const result = await new AgentWorker({ workerId: "worker-gate", runtime, engine }).runOnce();
    const persisted = await runtime.getRun({ userId: "user-gate-worker" }, created.run.id);

    expect(result?.status).toBe("waiting_user");
    expect(persisted?.status).toBe("waiting_user");
  });

  it("finishes cancellation when the user cancels at the execution safe point", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-cancel-safe-point" },
      {
        requestId: "request-cancel-safe-point",
        conversationId: 102,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    const engine = {
      execute: async ({ run }: { run: { id: string } }) => {
        await runtime.requestCancel(
          { userId: "user-cancel-safe-point" },
          run.id,
          "cancel-safe-point",
        );
        return { outcome: "succeeded" as const };
      },
    };

    const result = await new AgentWorker({ workerId: "worker-cancel-safe-point", runtime, engine }).runOnce();
    const persisted = await runtime.getRun({ userId: "user-cancel-safe-point" }, created.run.id);

    expect(result?.status).toBe("cancelled");
    expect(persisted?.status).toBe("cancelled");
  });

  it("automatically reconciles uncertain attempts before model execution", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-auto-reconcile" },
      {
        requestId: "request-auto-reconcile",
        conversationId: 103,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "继续应用简历修改" },
      },
    );
    let executions = 0;
    const worker = new AgentWorker({
      workerId: "worker-auto-reconcile",
      runtime,
      engine: {
        execute: async () => {
          executions += 1;
          return { outcome: "succeeded" as const };
        },
      },
      reconcileOutstanding: async () => ({ resolved: 0, unresolved: 1 }),
    });

    const result = await worker.runOnce();
    const persisted = await runtime.getRun({ userId: "user-auto-reconcile" }, created.run.id);

    expect(executions).toBe(0);
    expect(result?.status).toBe("waiting_user");
    expect(persisted?.status).toBe("waiting_user");
  });
});
