import { describe, expect, it } from "vitest";
import {
  AgentBackgroundJobService,
  InMemoryAgentBackgroundJobStore,
} from "@/lib/agent/runtime/agent-background-job";
import { AgentBackgroundJobWorker } from "@/lib/agent/runtime/agent-background-job-worker";
import { GovernedToolAttemptExecutor, InMemoryToolAttemptStore } from "@/lib/agent/runtime/governed-tool-attempt";
import { createBackgroundToolHandlers } from "@/lib/agent/runtime/background-tool-handlers";
import { ToolRegistry } from "@/lib/agent/tools/registry";

describe("durable Agent background jobs", () => {
  it("allows lease takeover and fences the stale Worker", async () => {
    const service = new AgentBackgroundJobService(new InMemoryAgentBackgroundJobStore());
    await service.createJob(
      { userId: "user-1" },
      {
        id: "job-1",
        runId: "run-1",
        toolAttemptId: "attempt-1",
        jobType: "export_file",
        handle: { artifactId: "artifact-1" },
        wakeAt: new Date("2026-08-24T10:00:00.000Z"),
      },
    );

    const first = await service.claimNextJob({
      workerId: "worker-a",
      now: new Date("2026-08-24T10:00:00.000Z"),
      leaseMs: 30_000,
    });
    const takeover = await service.claimNextJob({
      workerId: "worker-b",
      now: new Date("2026-08-24T10:00:31.000Z"),
      leaseMs: 30_000,
    });

    expect(first).toMatchObject({ ownerId: "worker-a", fencingToken: 1, status: "running" });
    expect(takeover).toMatchObject({ ownerId: "worker-b", fencingToken: 2, status: "running" });
    await expect(service.completeJob({
      jobId: "job-1",
      workerId: "worker-a",
      fencingToken: first!.fencingToken,
      result: { stale: true },
    })).rejects.toThrow("Background job fencing token mismatch");

    const completed = await service.completeJob({
      jobId: "job-1",
      workerId: "worker-b",
      fencingToken: takeover!.fencingToken,
      result: { artifactId: "artifact-1" },
    });
    expect(completed).toMatchObject({
      status: "succeeded",
      result: { artifactId: "artifact-1" },
      ownerId: null,
    });
  });

  it("executes a registered handler and persists its terminal result", async () => {
    const service = new AgentBackgroundJobService(new InMemoryAgentBackgroundJobStore());
    await service.createJob(
      { userId: "user-1" },
      {
        id: "job-2",
        runId: "run-2",
        jobType: "export_file",
        handle: { artifactId: "artifact-2" },
      },
    );
    const worker = new AgentBackgroundJobWorker({
      workerId: "background-worker-a",
      jobs: service,
      handlers: {
        export_file: async (job) => ({ artifactId: job.handle.artifactId, stored: true }),
      },
    });

    const result = await worker.runOnce();
    const persisted = await service.getJob({ userId: "user-1" }, "job-2");

    expect(result).toMatchObject({ status: "succeeded" });
    expect(persisted).toMatchObject({
      status: "succeeded",
      result: { artifactId: "artifact-2", stored: true },
    });
  });

  it("parks a governed long tool on a durable job and resumes with its result", async () => {
    const jobs = new AgentBackgroundJobService(new InMemoryAgentBackgroundJobStore());
    const registry = new ToolRegistry();
    registry.register({
      name: "export_file",
      description: "Export a file",
      category: "action",
      parameters: {},
      capability: {
        risk: "medium", deadlineClass: "background", deadlineMs: 2_000,
        cancellation: "after_dispatch_reconcile", idempotency: "request_key",
        reconciliation: "read_back", verification: "read_back",
        backgroundCapable: true, workerExecution: "background",
      },
      handler: async () => ({ success: true, data: { filename: "resume.md", readBackVerified: true } }),
      formatResult: (result) => JSON.stringify(result.data),
    });
    registry.seal();
    const executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore(), jobs);
    const backgroundWorker = new AgentBackgroundJobWorker({
      workerId: "background-worker",
      jobs,
      handlers: createBackgroundToolHandlers(registry),
    });

    const execution = executor.execute({
      principal: { userId: "user-1" }, runId: "run-1", workerId: "worker-1",
      fencingToken: 1, toolName: "export_file", args: { content: "resume" },
      allowlist: ["export_file"], signal: new AbortController().signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await backgroundWorker.runOnce();
    const outcome = await execution;

    expect(outcome).toMatchObject({
      runDirective: "continue",
      attempt: {
        status: "succeeded",
        effectState: "verified",
        result: { success: true, data: { filename: "resume.md" } },
      },
    });
  });
});
