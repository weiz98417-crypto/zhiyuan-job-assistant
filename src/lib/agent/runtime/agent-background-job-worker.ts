import type {
  AgentBackgroundJobService,
  AgentBackgroundJobSnapshot,
} from "@/lib/agent/runtime/agent-background-job";

export type AgentBackgroundJobHandler = (
  job: AgentBackgroundJobSnapshot,
  signal: AbortSignal,
) => Promise<Record<string, unknown>>;

export interface AgentBackgroundJobWorkerOptions {
  workerId: string;
  jobs: AgentBackgroundJobService;
  handlers: Record<string, AgentBackgroundJobHandler>;
  deadlineMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
}

export class AgentBackgroundJobWorker {
  private draining = false;

  constructor(private readonly options: AgentBackgroundJobWorkerOptions) {}

  drain(): void {
    this.draining = true;
  }

  async runOnce(): Promise<AgentBackgroundJobSnapshot | null> {
    if (this.draining) return null;
    const job = await this.options.jobs.claimNextJob({ workerId: this.options.workerId });
    if (!job) return null;
    const handler = this.options.handlers[job.jobType];
    if (!handler) {
      return this.options.jobs.failJob({
        jobId: job.id,
        workerId: this.options.workerId,
        fencingToken: job.fencingToken,
        error: { code: "handler_not_registered", message: `No handler for background job ${job.jobType}` },
      });
    }

    const controller = new AbortController();
    const deadlineMs = Math.max(1, this.options.deadlineMs || 5 * 60_000);
    const deadlineTimer = setTimeout(() => {
      controller.abort(new Error(`background job deadline exceeded: ${job.jobType}`));
    }, deadlineMs);
    const heartbeatTimer = setInterval(() => {
      void this.options.jobs.heartbeat({
        jobId: job.id,
        workerId: this.options.workerId,
        fencingToken: job.fencingToken,
        leaseMs: 30_000,
      }).catch(() => controller.abort(new Error("background job lease lost")));
    }, 10_000);

    try {
      const execution = handler(job, controller.signal);
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(controller.signal.reason instanceof Error
            ? controller.signal.reason
            : new Error("background job aborted"));
        }, { once: true });
      });
      const result = await Promise.race([execution, aborted]);
      return this.options.jobs.completeJob({
        jobId: job.id,
        workerId: this.options.workerId,
        fencingToken: job.fencingToken,
        result,
      });
    } catch (error) {
      const maxAttempts = Math.max(1, this.options.maxAttempts || 3);
      const retryAt = job.fencingToken < maxAttempts
        ? new Date(Date.now() + Math.max(1, this.options.retryDelayMs || 5_000))
        : undefined;
      return this.options.jobs.failJob({
        jobId: job.id,
        workerId: this.options.workerId,
        fencingToken: job.fencingToken,
        error: {
          message: error instanceof Error ? error.message : "Background job failed",
          retryable: Boolean(retryAt),
        },
        retryAt,
      });
    } finally {
      clearTimeout(deadlineTimer);
      clearInterval(heartbeatTimer);
    }
  }

  async runForever(options: {
    concurrency?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
  } = {}): Promise<void> {
    const concurrency = Math.max(1, Math.floor(options.concurrency || 1));
    const pollIntervalMs = Math.max(1, Math.floor(options.pollIntervalMs || 1_000));
    const active = new Set<Promise<AgentBackgroundJobSnapshot | null>>();
    const launch = () => {
      const task = this.runOnce().finally(() => active.delete(task));
      active.add(task);
    };
    while (!this.draining && !options.signal?.aborted) {
      while (active.size < concurrency && !this.draining && !options.signal?.aborted) launch();
      const result = await Promise.race(active);
      if (result === null) await delay(pollIntervalMs, options.signal);
    }
    await Promise.allSettled(active);
  }
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolveDelay) => {
    const timer = setTimeout(resolveDelay, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolveDelay();
    }, { once: true });
  });
}
