import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";

export type AgentBackgroundJobStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export interface AgentBackgroundJobSnapshot {
  id: string;
  runId: string;
  toolAttemptId: string | null;
  userId: string;
  jobType: string;
  status: AgentBackgroundJobStatus;
  handle: Record<string, unknown>;
  progress: Record<string, unknown>;
  result: Record<string, unknown>;
  error: Record<string, unknown>;
  wakeAt: string;
  leaseExpiresAt: string | null;
  ownerId: string | null;
  fencingToken: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateAgentBackgroundJobCommand {
  id: string;
  runId: string;
  toolAttemptId?: string | null;
  jobType: string;
  handle?: Record<string, unknown>;
  wakeAt?: Date;
}

export interface ClaimAgentBackgroundJobCommand {
  workerId: string;
  now?: Date;
  leaseMs?: number;
}

export interface CompleteAgentBackgroundJobCommand {
  jobId: string;
  workerId: string;
  fencingToken: number;
  result: Record<string, unknown>;
}

export interface FailAgentBackgroundJobCommand {
  jobId: string;
  workerId: string;
  fencingToken: number;
  error: Record<string, unknown>;
  retryAt?: Date;
}

export interface HeartbeatAgentBackgroundJobCommand {
  jobId: string;
  workerId: string;
  fencingToken: number;
  now?: Date;
  leaseMs?: number;
}

export interface AgentBackgroundJobStore {
  create(
    principal: ExecutionPrincipal,
    command: CreateAgentBackgroundJobCommand,
  ): Promise<AgentBackgroundJobSnapshot>;
  claimNext(command: ClaimAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot | null>;
  complete(command: CompleteAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot>;
  fail(command: FailAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot>;
  heartbeat(command: HeartbeatAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot>;
  get(principal: ExecutionPrincipal, jobId: string): Promise<AgentBackgroundJobSnapshot | null>;
}

export class AgentBackgroundJobService {
  constructor(private readonly store: AgentBackgroundJobStore) {}

  createJob(
    principal: ExecutionPrincipal,
    command: CreateAgentBackgroundJobCommand,
  ): Promise<AgentBackgroundJobSnapshot> {
    return this.store.create(principal, command);
  }

  claimNextJob(command: ClaimAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot | null> {
    return this.store.claimNext(command);
  }

  completeJob(command: CompleteAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    return this.store.complete(command);
  }

  failJob(command: FailAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    return this.store.fail(command);
  }

  heartbeat(command: HeartbeatAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    return this.store.heartbeat(command);
  }

  getJob(principal: ExecutionPrincipal, jobId: string): Promise<AgentBackgroundJobSnapshot | null> {
    return this.store.get(principal, jobId);
  }
}

export class InMemoryAgentBackgroundJobStore implements AgentBackgroundJobStore {
  private readonly jobs = new Map<string, AgentBackgroundJobSnapshot>();

  async create(
    principal: ExecutionPrincipal,
    command: CreateAgentBackgroundJobCommand,
  ): Promise<AgentBackgroundJobSnapshot> {
    const existing = this.jobs.get(command.id);
    if (existing) {
      if (existing.userId !== principal.userId) throw new Error("Background job access denied");
      return clone(existing);
    }
    const now = new Date();
    const job: AgentBackgroundJobSnapshot = {
      id: command.id,
      runId: command.runId,
      toolAttemptId: command.toolAttemptId || null,
      userId: principal.userId,
      jobType: command.jobType,
      status: "queued",
      handle: { ...command.handle },
      progress: {},
      result: {},
      error: {},
      wakeAt: (command.wakeAt || now).toISOString(),
      leaseExpiresAt: null,
      ownerId: null,
      fencingToken: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
    };
    this.jobs.set(job.id, job);
    return clone(job);
  }

  async claimNext(command: ClaimAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot | null> {
    const now = command.now || new Date();
    const leaseMs = Math.max(1, command.leaseMs || 30_000);
    const claimable = Array.from(this.jobs.values())
      .filter((job) => {
        if ((job.status === "queued" || job.status === "waiting") && Date.parse(job.wakeAt) <= now.getTime()) return true;
        return job.status === "running"
          && Boolean(job.leaseExpiresAt)
          && Date.parse(job.leaseExpiresAt!) <= now.getTime();
      })
      .sort((left, right) => Date.parse(left.wakeAt) - Date.parse(right.wakeAt))[0];
    if (!claimable) return null;
    claimable.status = "running";
    claimable.ownerId = command.workerId;
    claimable.fencingToken += 1;
    claimable.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    claimable.updatedAt = now.toISOString();
    return clone(claimable);
  }

  async complete(command: CompleteAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    const job = this.owned(command.jobId, command.workerId, command.fencingToken);
    const now = new Date().toISOString();
    job.status = "succeeded";
    job.result = { ...command.result };
    job.error = {};
    job.ownerId = null;
    job.leaseExpiresAt = null;
    job.updatedAt = now;
    job.completedAt = now;
    return clone(job);
  }

  async fail(command: FailAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    const job = this.owned(command.jobId, command.workerId, command.fencingToken);
    const now = new Date();
    job.status = command.retryAt ? "waiting" : "failed";
    job.error = { ...command.error };
    job.ownerId = null;
    job.leaseExpiresAt = null;
    job.wakeAt = (command.retryAt || now).toISOString();
    job.updatedAt = now.toISOString();
    job.completedAt = command.retryAt ? null : now.toISOString();
    return clone(job);
  }

  async heartbeat(command: HeartbeatAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    const job = this.owned(command.jobId, command.workerId, command.fencingToken);
    const now = command.now || new Date();
    job.leaseExpiresAt = new Date(now.getTime() + Math.max(1, command.leaseMs || 30_000)).toISOString();
    job.updatedAt = now.toISOString();
    return clone(job);
  }

  async get(principal: ExecutionPrincipal, jobId: string): Promise<AgentBackgroundJobSnapshot | null> {
    const job = this.jobs.get(jobId);
    return job?.userId === principal.userId ? clone(job) : null;
  }

  private owned(jobId: string, workerId: string, fencingToken: number): AgentBackgroundJobSnapshot {
    const job = this.jobs.get(jobId);
    if (!job || job.ownerId !== workerId || job.fencingToken !== fencingToken) {
      throw new Error("Background job fencing token mismatch");
    }
    return job;
  }
}

function clone(job: AgentBackgroundJobSnapshot): AgentBackgroundJobSnapshot {
  return structuredClone(job);
}
