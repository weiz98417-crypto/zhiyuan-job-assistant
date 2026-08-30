import dotenv from "dotenv";
import os from "os";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { PostgresRunWakeSource } from "@/lib/agent/runtime/postgres-run-wake-source";
import { getDurableAgentRuntime } from "@/lib/agent/runtime/runtime-factory";
import { AgentRuntimeRetentionService } from "@/lib/agent/runtime/runtime-retention";
import { PostgresRunOutboxStore } from "@/lib/agent/runtime/postgres-run-outbox-store";
import { createRunEvidenceHandlers } from "@/lib/agent/runtime/run-evidence-handlers";
import { RunEvidenceObserver } from "@/lib/agent/runtime/run-evidence-observer";
import { AgentBackgroundJobService } from "@/lib/agent/runtime/agent-background-job";
import { AgentBackgroundJobWorker } from "@/lib/agent/runtime/agent-background-job-worker";
import { PostgresAgentBackgroundJobStore } from "@/lib/agent/runtime/postgres-background-job-store";
import { AgentRuntimeMaintenanceService } from "@/lib/agent/runtime/runtime-maintenance";
import registry from "@/lib/agent/tools";
import { createBackgroundToolHandlers } from "@/lib/agent/runtime/background-tool-handlers";
import { PostgresRunContextSource } from "@/lib/agent/runtime/postgres-run-context-source";
import { reconcileGovernedRuntimeTools } from "@/lib/agent/runtime/governed-tool-runtime";

dotenv.config({ path: ".env.local" });
dotenv.config();

const runtime = getDurableAgentRuntime();
const workerId = process.env.AGENT_WORKER_ID?.trim() || `${os.hostname()}:${process.pid}`;
const wakeSource = new PostgresRunWakeSource({
  fallbackPollMs: positiveInteger(process.env.AGENT_WORKER_POLL_MS, 1_000),
});
const worker = new AgentWorker({
  workerId,
  runtime,
  engine: new DurableOrchestratorExecutionEngine({
    runtime,
    contextSource: new PostgresRunContextSource(),
  }),
  attemptDeadlineMs: positiveInteger(process.env.AGENT_WORKER_ATTEMPT_DEADLINE_MS, 180_000),
  reconcileOutstanding: reconcileGovernedRuntimeTools,
  shouldPauseClaims: () => truthy(process.env.AGENT_WORKER_PAUSE_CLAIMS),
});
const backgroundWorker = new AgentBackgroundJobWorker({
  workerId: `background:${workerId}`,
  jobs: new AgentBackgroundJobService(new PostgresAgentBackgroundJobStore()),
  handlers: createBackgroundToolHandlers(registry),
  deadlineMs: positiveInteger(process.env.AGENT_BACKGROUND_JOB_DEADLINE_MS, 5 * 60_000),
});
const shutdown = new AbortController();
const retention = new AgentRuntimeRetentionService();
const maintenance = new AgentRuntimeMaintenanceService();
const observer = new RunEvidenceObserver(
  new PostgresRunOutboxStore(),
  createRunEvidenceHandlers(),
);
let observerRunning = false;
const observerTimer = setInterval(() => {
  if (observerRunning) return;
  observerRunning = true;
  void observer.processBatch(`observer:${os.hostname()}:${process.pid}`, 50)
    .catch((error) => {
      const message = error instanceof Error ? error.message : "evidence observer failed";
      console.error(`[agent-worker] ${message}`);
    })
    .finally(() => {
      observerRunning = false;
    });
}, positiveInteger(process.env.AGENT_OBSERVER_POLL_MS, 1_000));
observerTimer.unref();
const retentionTimer = setInterval(() => {
  void Promise.all([
    retention.cleanup(),
    maintenance.expireWaitingUserRuns(),
  ]).catch((error) => {
    const message = error instanceof Error ? error.message : "runtime maintenance failed";
    console.error(`[agent-worker] ${message}`);
  });
}, positiveInteger(process.env.AGENT_RUNTIME_RETENTION_INTERVAL_MS, 60 * 60 * 1_000));
retentionTimer.unref();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    worker.drain();
    backgroundWorker.drain();
    shutdown.abort();
  });
}

process.send?.("ready");

try {
  await Promise.all([
    worker.runForever({
      concurrency: positiveInteger(process.env.AGENT_WORKER_CONCURRENCY, 2),
      pollIntervalMs: positiveInteger(process.env.AGENT_WORKER_POLL_MS, 1_000),
      signal: shutdown.signal,
      waitForWork: (signal) => wakeSource.wait(signal),
    }),
    backgroundWorker.runForever({
      concurrency: positiveInteger(process.env.AGENT_BACKGROUND_JOB_CONCURRENCY, 1),
      pollIntervalMs: positiveInteger(process.env.AGENT_BACKGROUND_JOB_POLL_MS, 1_000),
      signal: shutdown.signal,
    }),
  ]);
} catch (error) {
  const message = error instanceof Error ? error.message : "Agent Worker failed";
  console.error(`[agent-worker] ${message}`);
  process.exitCode = 1;
} finally {
  clearInterval(observerTimer);
  clearInterval(retentionTimer);
  await wakeSource.close();
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function truthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}
