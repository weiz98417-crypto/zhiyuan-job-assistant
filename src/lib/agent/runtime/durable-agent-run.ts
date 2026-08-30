import { randomUUID } from "crypto";
import { transitionAgentRun } from "@/lib/agent/runtime/state-machine";
import {
  isTerminalAgentRunStatus,
  type AgentRunStatus,
} from "@/lib/agent/runtime/types";
import type { AgentRuntimeObservation } from "@/lib/agent/runtime/observation";

export interface ExecutionPrincipal {
  userId: string;
}

export interface DurableRunInput {
  content: string;
  images?: string[];
  persistInConversation?: boolean;
}

export interface CreateAgentRunCommand {
  requestId: string;
  conversationId: number | null;
  taskType: string;
  agentId: string;
  input: DurableRunInput;
  contract?: unknown;
  runtimeMode?: "shadow" | "worker_readonly" | "worker_all";
  parentRunId?: string | null;
  policyVersions?: Record<string, string>;
  budgets?: Record<string, unknown>;
}

export interface AgentRunSnapshot {
  id: string;
  userId: string;
  conversationId: number | null;
  requestId: string;
  taskType: string;
  agentId: string;
  status: AgentRunStatus;
  snapshotVersion: number;
  eventCursor: number;
  contract: unknown;
  budgets: Record<string, unknown>;
  lastObservation: Record<string, unknown>;
  error: Record<string, unknown>;
  runtimeMode: string;
  parentRunId: string | null;
  depth: number;
  ownerId: string | null;
  fencingToken: number;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentRunResult {
  run: AgentRunSnapshot;
  replayed: boolean;
}

export interface AgentRunEvent {
  runId: string;
  userId: string;
  sequence: number;
  type: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ClaimAgentRunCommand {
  workerId: string;
  now?: Date;
  leaseMs?: number;
}

export interface HeartbeatAgentRunCommand {
  runId: string;
  workerId: string;
  fencingToken: number;
  now?: Date;
  leaseMs?: number;
}

export interface TransitionAgentRunCommand {
  runId: string;
  workerId: string;
  fencingToken: number;
  nextStatus: AgentRunStatus;
  observation?: AgentRuntimeObservation;
  error?: Record<string, unknown>;
}

export interface AgentRunControlCommand {
  runId: string;
  requestId: string;
}

export interface RecordAgentRunEventCommand {
  runId: string;
  workerId: string;
  fencingToken: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface ConsumeAgentRunInputsCommand {
  runId: string;
  workerId: string;
  fencingToken: number;
  inputIds: number[];
}

export interface AgentRunFactReference {
  type: string;
  id: string;
  version: string;
  hash?: string;
}

export interface SaveAgentRunCheckpointCommand {
  runId: string;
  workerId: string;
  fencingToken: number;
  boundary: string;
  context: Record<string, unknown>;
  plan: Record<string, unknown>;
  budgets: Record<string, unknown>;
  factRefs: AgentRunFactReference[];
}

export interface AgentRunCheckpoint {
  id: number;
  runId: string;
  userId: string;
  snapshotVersion: number;
  fencingToken: number;
  boundary: string;
  context: Record<string, unknown>;
  plan: Record<string, unknown>;
  budgets: Record<string, unknown>;
  factRefs: AgentRunFactReference[];
  createdAt: string;
}

export type AgentRunGateStatus = "pending" | "approved" | "denied" | "expired" | "cancelled";

export interface AgentRunGate {
  id: string;
  runId: string;
  userId: string;
  toolName: string;
  risk: string;
  scopeHash: string;
  status: AgentRunGateStatus;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AgentRunInputRecord {
  id: number;
  runId: string;
  userId: string;
  requestId: string;
  inputType: string;
  content: DurableRunInput;
  status: "pending" | "consumed" | "rejected";
  createdAt: string;
  consumedAt: string | null;
}

export interface SubmitAgentRunInputResult {
  run: AgentRunSnapshot;
  input: AgentRunInputRecord;
  replayed: boolean;
}

export interface OpenAgentRunGateCommand {
  runId: string;
  workerId: string;
  fencingToken: number;
  toolName: string;
  risk: string;
  scopeHash: string;
  request: Record<string, unknown>;
}

export interface AgentRunStore {
  createRun(
    principal: ExecutionPrincipal,
    command: CreateAgentRunCommand,
  ): Promise<CreateAgentRunResult>;
  claimNextRun(command: ClaimAgentRunCommand): Promise<AgentRunSnapshot | null>;
  transitionRun(command: TransitionAgentRunCommand): Promise<AgentRunSnapshot>;
  listEvents(
    principal: ExecutionPrincipal,
    runId: string,
    afterCursor: number,
  ): Promise<AgentRunEvent[]>;
  saveCheckpoint(command: SaveAgentRunCheckpointCommand): Promise<AgentRunCheckpoint>;
  getLatestCheckpoint(
    principal: ExecutionPrincipal,
    runId: string,
  ): Promise<AgentRunCheckpoint | null>;
  requestCancel(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
  ): Promise<AgentRunSnapshot>;
  requestPause(principal: ExecutionPrincipal, runId: string, requestId: string): Promise<AgentRunSnapshot>;
  resumeRun(principal: ExecutionPrincipal, runId: string, requestId: string): Promise<AgentRunSnapshot>;
  openGate(command: OpenAgentRunGateCommand): Promise<AgentRunGate>;
  respondGate(
    principal: ExecutionPrincipal,
    gateId: string,
    requestId: string,
    decision: "approved" | "denied",
  ): Promise<AgentRunGate>;
  isGateApproved(
    principal: ExecutionPrincipal,
    runId: string,
    scopeHash: string,
  ): Promise<boolean>;
  isGateDenied(
    principal: ExecutionPrincipal,
    runId: string,
    scopeHash: string,
  ): Promise<boolean>;
  submitInput(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
    input: DurableRunInput,
  ): Promise<SubmitAgentRunInputResult>;
  getRun(principal: ExecutionPrincipal, runId: string): Promise<AgentRunSnapshot | null>;
  listPendingInputs(principal: ExecutionPrincipal, runId: string): Promise<AgentRunInputRecord[]>;
  consumeInputs(command: ConsumeAgentRunInputsCommand): Promise<void>;
  recordEvent(command: RecordAgentRunEventCommand): Promise<AgentRunEvent>;
  heartbeat(command: HeartbeatAgentRunCommand): Promise<AgentRunSnapshot>;
  listRuns(
    principal: ExecutionPrincipal,
    options?: { conversationId?: number; activeOnly?: boolean; limit?: number },
  ): Promise<AgentRunSnapshot[]>;
}

export class DurableAgentRunService {
  constructor(private readonly store: AgentRunStore) {}

  createRun(
    principal: ExecutionPrincipal,
    command: CreateAgentRunCommand,
  ): Promise<CreateAgentRunResult> {
    if (!principal.userId.trim()) throw new Error("Execution Principal userId is required");
    if (!command.requestId.trim()) throw new Error("Agent Run requestId is required");
    if (!command.input.content.trim()) throw new Error("Agent Run input content is required");
    return this.store.createRun(principal, command);
  }

  claimNextRun(command: ClaimAgentRunCommand): Promise<AgentRunSnapshot | null> {
    if (!command.workerId.trim()) throw new Error("Agent Worker id is required");
    return this.store.claimNextRun(command);
  }

  transitionRun(command: TransitionAgentRunCommand): Promise<AgentRunSnapshot> {
    return this.store.transitionRun(command);
  }

  listEvents(
    principal: ExecutionPrincipal,
    runId: string,
    afterCursor = 0,
  ): Promise<AgentRunEvent[]> {
    return this.store.listEvents(principal, runId, Math.max(0, Math.floor(afterCursor)));
  }

  saveCheckpoint(command: SaveAgentRunCheckpointCommand): Promise<AgentRunCheckpoint> {
    if (!command.boundary.trim()) throw new Error("Checkpoint boundary is required");
    return this.store.saveCheckpoint(command);
  }

  getLatestCheckpoint(
    principal: ExecutionPrincipal,
    runId: string,
  ): Promise<AgentRunCheckpoint | null> {
    return this.store.getLatestCheckpoint(principal, runId);
  }

  requestCancel(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
  ): Promise<AgentRunSnapshot> {
    if (!requestId.trim()) throw new Error("Cancel requestId is required");
    return this.store.requestCancel(principal, runId, requestId);
  }

  requestPause(principal: ExecutionPrincipal, runId: string, requestId: string): Promise<AgentRunSnapshot> {
    if (!requestId.trim()) throw new Error("Pause requestId is required");
    return this.store.requestPause(principal, runId, requestId);
  }

  resumeRun(principal: ExecutionPrincipal, runId: string, requestId: string): Promise<AgentRunSnapshot> {
    if (!requestId.trim()) throw new Error("Resume requestId is required");
    return this.store.resumeRun(principal, runId, requestId);
  }

  openGate(command: OpenAgentRunGateCommand): Promise<AgentRunGate> {
    return this.store.openGate(command);
  }

  respondGate(
    principal: ExecutionPrincipal,
    gateId: string,
    requestId: string,
    decision: "approved" | "denied",
  ): Promise<AgentRunGate> {
    if (!requestId.trim()) throw new Error("Gate response requestId is required");
    return this.store.respondGate(principal, gateId, requestId, decision);
  }

  isGateApproved(
    principal: ExecutionPrincipal,
    runId: string,
    scopeHash: string,
  ): Promise<boolean> {
    return this.store.isGateApproved(principal, runId, scopeHash);
  }

  isGateDenied(
    principal: ExecutionPrincipal,
    runId: string,
    scopeHash: string,
  ): Promise<boolean> {
    return this.store.isGateDenied(principal, runId, scopeHash);
  }

  submitInput(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
    input: DurableRunInput,
  ): Promise<SubmitAgentRunInputResult> {
    if (!requestId.trim()) throw new Error("Agent Run input requestId is required");
    if (!input.content.trim()) throw new Error("Agent Run input content is required");
    return this.store.submitInput(principal, runId, requestId, input);
  }

  getRun(principal: ExecutionPrincipal, runId: string): Promise<AgentRunSnapshot | null> {
    return this.store.getRun(principal, runId);
  }

  listPendingInputs(principal: ExecutionPrincipal, runId: string): Promise<AgentRunInputRecord[]> {
    return this.store.listPendingInputs(principal, runId);
  }

  consumeInputs(command: ConsumeAgentRunInputsCommand): Promise<void> {
    return this.store.consumeInputs(command);
  }

  recordEvent(command: RecordAgentRunEventCommand): Promise<AgentRunEvent> {
    return this.store.recordEvent(command);
  }

  heartbeat(command: HeartbeatAgentRunCommand): Promise<AgentRunSnapshot> {
    return this.store.heartbeat(command);
  }

  listRuns(
    principal: ExecutionPrincipal,
    options?: { conversationId?: number; activeOnly?: boolean; limit?: number },
  ): Promise<AgentRunSnapshot[]> {
    return this.store.listRuns(principal, options);
  }
}

export class InMemoryAgentRunStore implements AgentRunStore {
  private readonly runsByRequest = new Map<string, AgentRunSnapshot>();
  private readonly runsById = new Map<string, AgentRunSnapshot>();
  private readonly activeRunByConversation = new Map<string, string>();
  private readonly eventsByRun = new Map<string, AgentRunEvent[]>();
  private readonly checkpointsByRun = new Map<string, AgentRunCheckpoint[]>();
  private readonly commandRequests = new Set<string>();
  private readonly gatesById = new Map<string, AgentRunGate>();
  private readonly inputsByRequest = new Map<string, AgentRunInputRecord>();
  private inputSequence = 0;
  private checkpointSequence = 0;

  async createRun(
    principal: ExecutionPrincipal,
    command: CreateAgentRunCommand,
  ): Promise<CreateAgentRunResult> {
    const requestKey = `${principal.userId}:${command.requestId}`;
    const existing = this.runsByRequest.get(requestKey);
    if (existing) return { run: { ...existing }, replayed: true };

    const conversationKey = command.conversationId === null
      ? null
      : `${principal.userId}:${command.conversationId}`;
    if (conversationKey && this.activeRunByConversation.has(conversationKey)) {
      throw new Error(`Conversation ${command.conversationId} already has a nonterminal Agent Run`);
    }
    const parent = command.parentRunId ? this.runsById.get(command.parentRunId) : null;
    if (command.parentRunId && (!parent || parent.userId !== principal.userId)) {
      throw new Error("Parent Agent Run not found");
    }
    const depth = parent ? parent.depth + 1 : 0;
    if (depth > 2) throw new Error("Agent Run child depth exceeds 2");
    if (parent) {
      const activeChildren = Array.from(this.runsById.values()).filter((candidate) => (
        candidate.parentRunId === parent.id && !isTerminalAgentRunStatus(candidate.status)
      ));
      if (activeChildren.length >= 4) throw new Error("Agent Run active child limit exceeds 4");
    }

    const now = new Date().toISOString();
    const run: AgentRunSnapshot = {
      id: randomUUID(),
      userId: principal.userId,
      conversationId: command.conversationId,
      requestId: command.requestId,
      taskType: command.taskType,
      agentId: command.agentId,
      status: "queued",
      snapshotVersion: 1,
      eventCursor: 0,
      contract: command.contract ?? {},
      budgets: { ...(command.budgets || {}) },
      lastObservation: {},
      error: {},
      runtimeMode: command.runtimeMode || "worker_all",
      parentRunId: command.parentRunId || null,
      depth,
      ownerId: null,
      fencingToken: 0,
      heartbeatAt: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.runsByRequest.set(requestKey, run);
    this.runsById.set(run.id, run);
    if (conversationKey) this.activeRunByConversation.set(conversationKey, run.id);
    this.appendEvent(run, "run.created", { status: run.status });
    this.inputsByRequest.set(requestKey, {
      id: ++this.inputSequence,
      runId: run.id,
      userId: run.userId,
      requestId: command.requestId,
      inputType: "turn",
      content: { ...command.input, images: command.input.images ? [...command.input.images] : undefined },
      status: "pending",
      createdAt: now,
      consumedAt: null,
    });
    return { run: { ...run }, replayed: false };
  }

  async claimNextRun(command: ClaimAgentRunCommand): Promise<AgentRunSnapshot | null> {
    const now = command.now || new Date();
    const leaseMs = command.leaseMs ?? 30_000;
    const eligible = Array.from(this.runsById.values())
      .filter((run) => run.status === "queued" || (
        run.status === "cancel_requested"
        && run.ownerId === null
      ) || (
        !isTerminalAgentRunStatus(run.status)
        && run.leaseExpiresAt !== null
        && new Date(run.leaseExpiresAt).getTime() <= now.getTime()
      ))
      .filter((run) => {
        if (run.conversationId === null) return true;
        return !Array.from(this.runsById.values()).some((other) => (
          other.id !== run.id
          && other.userId === run.userId
          && other.conversationId === run.conversationId
          && ["running", "recovering", "verifying", "cancel_requested"].includes(other.status)
          && other.leaseExpiresAt !== null
          && new Date(other.leaseExpiresAt).getTime() > now.getTime()
        ));
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (!eligible) return null;

    eligible.status = eligible.status === "queued" ? "running" : eligible.status;
    eligible.ownerId = command.workerId;
    eligible.fencingToken += 1;
    eligible.heartbeatAt = now.toISOString();
    eligible.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    eligible.snapshotVersion += 1;
    eligible.updatedAt = now.toISOString();
    this.appendEvent(eligible, "run.claimed", {
      workerId: command.workerId,
      fencingToken: eligible.fencingToken,
      leaseExpiresAt: eligible.leaseExpiresAt,
    }, now);
    return { ...eligible };
  }

  async transitionRun(command: TransitionAgentRunCommand): Promise<AgentRunSnapshot> {
    const run = this.runsById.get(command.runId);
    if (!run) throw new Error("Agent Run not found");
    if (run.ownerId !== command.workerId || run.fencingToken !== command.fencingToken) {
      throw new Error("Stale Agent Run owner");
    }

    run.status = transitionAgentRun(run.status, command.nextStatus);
    if (command.observation) run.lastObservation = { ...command.observation };
    if (command.error) run.error = { ...command.error };
    run.snapshotVersion += 1;
    run.updatedAt = new Date().toISOString();
    if (run.status === "waiting_user" || run.status === "queued" || run.status === "paused") {
      run.ownerId = null;
      run.leaseExpiresAt = null;
    }
    this.appendEvent(run, "run.status_changed", { status: run.status });
    if (isTerminalAgentRunStatus(run.status) && run.conversationId !== null) {
      this.activeRunByConversation.delete(`${run.userId}:${run.conversationId}`);
    }
    return { ...run };
  }

  async listEvents(
    principal: ExecutionPrincipal,
    runId: string,
    afterCursor: number,
  ): Promise<AgentRunEvent[]> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) return [];
    return (this.eventsByRun.get(runId) || [])
      .filter((event) => event.sequence > afterCursor)
      .map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  async saveCheckpoint(command: SaveAgentRunCheckpointCommand): Promise<AgentRunCheckpoint> {
    const run = this.runsById.get(command.runId);
    if (!run) throw new Error("Agent Run not found");
    const owned = run.ownerId === command.workerId && run.fencingToken === command.fencingToken;
    const gateOpenerFinishing = run.status === "waiting_user"
      && run.ownerId === null
      && run.fencingToken === command.fencingToken;
    if (!owned && !gateOpenerFinishing) {
      throw new Error("Stale Agent Run owner");
    }

    run.snapshotVersion += 1;
    run.budgets = { ...command.budgets };
    const checkpoint: AgentRunCheckpoint = {
      id: ++this.checkpointSequence,
      runId: run.id,
      userId: run.userId,
      snapshotVersion: run.snapshotVersion,
      fencingToken: run.fencingToken,
      boundary: command.boundary,
      context: { ...command.context },
      plan: { ...command.plan },
      budgets: { ...command.budgets },
      factRefs: command.factRefs.map((reference) => ({ ...reference })),
      createdAt: new Date().toISOString(),
    };
    const checkpoints = this.checkpointsByRun.get(run.id) || [];
    checkpoints.push(checkpoint);
    this.checkpointsByRun.set(run.id, checkpoints);
    this.appendEvent(run, "run.checkpointed", {
      checkpointId: checkpoint.id,
      boundary: checkpoint.boundary,
      snapshotVersion: checkpoint.snapshotVersion,
    });
    return this.cloneCheckpoint(checkpoint);
  }

  async getLatestCheckpoint(
    principal: ExecutionPrincipal,
    runId: string,
  ): Promise<AgentRunCheckpoint | null> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) return null;
    const checkpoints = this.checkpointsByRun.get(runId) || [];
    const checkpoint = checkpoints.at(-1);
    return checkpoint ? this.cloneCheckpoint(checkpoint) : null;
  }

  async requestCancel(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
  ): Promise<AgentRunSnapshot> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) throw new Error("Agent Run not found");
    const requestKey = `${principal.userId}:${requestId}`;
    if (this.commandRequests.has(requestKey) || run.status === "cancel_requested" || isTerminalAgentRunStatus(run.status)) {
      return { ...run };
    }
    this.commandRequests.add(requestKey);
    run.status = transitionAgentRun(run.status, "cancel_requested");
    run.snapshotVersion += 1;
    this.appendEvent(run, "run.cancel_requested", { requestId });
    const pendingParents = [run.id];
    while (pendingParents.length > 0) {
      const parentRunId = pendingParents.shift()!;
      for (const child of this.runsById.values()) {
        if (child.parentRunId !== parentRunId || isTerminalAgentRunStatus(child.status)) continue;
        if (child.status !== "cancel_requested") {
          child.status = transitionAgentRun(child.status, "cancel_requested");
          child.snapshotVersion += 1;
          this.appendEvent(child, "run.cancel_requested", {
            requestId,
            propagatedFromRunId: run.id,
          });
        }
        pendingParents.push(child.id);
      }
    }
    return { ...run };
  }

  async requestPause(principal: ExecutionPrincipal, runId: string, requestId: string): Promise<AgentRunSnapshot> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) throw new Error("Agent Run not found");
    const requestKey = `${principal.userId}:pause:${requestId}`;
    if (this.commandRequests.has(requestKey) || isTerminalAgentRunStatus(run.status)) return { ...run };
    this.commandRequests.add(requestKey);
    if (run.status !== "paused") {
      run.status = transitionAgentRun(run.status, "paused");
      run.ownerId = null;
      run.leaseExpiresAt = null;
      run.snapshotVersion += 1;
      this.activeRunByConversation.delete(run.conversationId === null ? "" : `${run.userId}:${run.conversationId}`);
      this.appendEvent(run, "run.paused", { requestId });
    }
    return { ...run };
  }

  async resumeRun(principal: ExecutionPrincipal, runId: string, requestId: string): Promise<AgentRunSnapshot> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) throw new Error("Agent Run not found");
    const requestKey = `${principal.userId}:resume:${requestId}`;
    if (this.commandRequests.has(requestKey)) return { ...run };
    this.commandRequests.add(requestKey);
    if (run.status !== "paused") return { ...run };
    const key = run.conversationId === null ? null : `${run.userId}:${run.conversationId}`;
    if (key && this.activeRunByConversation.has(key)) throw new Error("Conversation already has an active Agent Run");
    run.status = transitionAgentRun(run.status, "queued");
    run.snapshotVersion += 1;
    if (key) this.activeRunByConversation.set(key, run.id);
    this.appendEvent(run, "run.resumed", { requestId });
    return { ...run };
  }

  async openGate(command: OpenAgentRunGateCommand): Promise<AgentRunGate> {
    const run = this.runsById.get(command.runId);
    if (!run) throw new Error("Agent Run not found");
    if (run.ownerId !== command.workerId || run.fencingToken !== command.fencingToken) {
      throw new Error("Stale Agent Run owner");
    }
    run.status = transitionAgentRun(run.status, "waiting_user");
    run.snapshotVersion += 1;
    run.ownerId = null;
    run.leaseExpiresAt = null;
    const gate: AgentRunGate = {
      id: randomUUID(),
      runId: run.id,
      userId: run.userId,
      toolName: command.toolName,
      risk: command.risk,
      scopeHash: command.scopeHash,
      status: "pending",
      request: { ...command.request },
      response: {},
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    this.gatesById.set(gate.id, gate);
    this.appendEvent(run, "run.gate_opened", {
      gateId: gate.id,
      toolName: gate.toolName,
      risk: gate.risk,
      scopeHash: gate.scopeHash,
    });
    return this.cloneGate(gate);
  }

  async respondGate(
    principal: ExecutionPrincipal,
    gateId: string,
    requestId: string,
    decision: "approved" | "denied",
  ): Promise<AgentRunGate> {
    const gate = this.gatesById.get(gateId);
    if (!gate || gate.userId !== principal.userId) throw new Error("Run Gate not found");
    const requestKey = `${principal.userId}:${requestId}`;
    if (this.commandRequests.has(requestKey) || gate.status !== "pending") return this.cloneGate(gate);
    this.commandRequests.add(requestKey);
    gate.status = decision;
    gate.response = { decision };
    gate.resolvedAt = new Date().toISOString();
    const run = this.runsById.get(gate.runId)!;
    if (run.status === "waiting_user") {
      run.status = transitionAgentRun(run.status, "queued");
      run.snapshotVersion += 1;
      this.appendEvent(run, "run.gate_resolved", {
        gateId: gate.id,
        decision,
        scopeHash: gate.scopeHash,
      });
    }
    return this.cloneGate(gate);
  }

  async isGateApproved(
    principal: ExecutionPrincipal,
    runId: string,
    scopeHash: string,
  ): Promise<boolean> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) return false;
    return Array.from(this.gatesById.values()).some((gate) => (
      gate.runId === runId
      && gate.userId === principal.userId
      && gate.scopeHash === scopeHash
      && gate.status === "approved"
    ));
  }

  async isGateDenied(
    principal: ExecutionPrincipal,
    runId: string,
    scopeHash: string,
  ): Promise<boolean> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) return false;
    return Array.from(this.gatesById.values()).some((gate) => (
      gate.runId === runId
      && gate.userId === principal.userId
      && gate.scopeHash === scopeHash
      && gate.status === "denied"
    ));
  }

  async submitInput(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
    input: DurableRunInput,
  ): Promise<SubmitAgentRunInputResult> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) throw new Error("Agent Run not found");
    if (isTerminalAgentRunStatus(run.status)) throw new Error("Terminal Agent Run cannot accept input");
    const requestKey = `${principal.userId}:${requestId}`;
    const existing = this.inputsByRequest.get(requestKey);
    if (existing) return { run: { ...run }, input: this.cloneInput(existing), replayed: true };

    const record: AgentRunInputRecord = {
      id: ++this.inputSequence,
      runId,
      userId: principal.userId,
      requestId,
      inputType: "turn",
      content: { ...input, images: input.images ? [...input.images] : undefined },
      status: "pending",
      createdAt: new Date().toISOString(),
      consumedAt: null,
    };
    this.inputsByRequest.set(requestKey, record);
    if (run.status === "waiting_user") run.status = transitionAgentRun(run.status, "queued");
    run.snapshotVersion += 1;
    this.appendEvent(run, "run.input_accepted", { requestId, inputId: record.id });
    return { run: { ...run }, input: this.cloneInput(record), replayed: false };
  }

  async getRun(principal: ExecutionPrincipal, runId: string): Promise<AgentRunSnapshot | null> {
    const run = this.runsById.get(runId);
    return run && run.userId === principal.userId ? { ...run, budgets: { ...run.budgets } } : null;
  }

  async listPendingInputs(principal: ExecutionPrincipal, runId: string): Promise<AgentRunInputRecord[]> {
    const run = this.runsById.get(runId);
    if (!run || run.userId !== principal.userId) return [];
    return Array.from(this.inputsByRequest.values())
      .filter((input) => input.runId === runId && input.status === "pending")
      .sort((left, right) => left.id - right.id)
      .map((input) => this.cloneInput(input));
  }

  async consumeInputs(command: ConsumeAgentRunInputsCommand): Promise<void> {
    const run = this.runsById.get(command.runId);
    if (!run) throw new Error("Agent Run not found");
    if (run.ownerId !== command.workerId || run.fencingToken !== command.fencingToken) {
      throw new Error("Stale Agent Run owner");
    }
    const consumedAt = new Date().toISOString();
    for (const input of this.inputsByRequest.values()) {
      if (input.runId === run.id && command.inputIds.includes(input.id) && input.status === "pending") {
        input.status = "consumed";
        input.consumedAt = consumedAt;
      }
    }
  }

  async recordEvent(command: RecordAgentRunEventCommand): Promise<AgentRunEvent> {
    const run = this.runsById.get(command.runId);
    if (!run) throw new Error("Agent Run not found");
    const owned = run.ownerId === command.workerId && run.fencingToken === command.fencingToken;
    const gateOpenerFinishing = run.status === "waiting_user"
      && run.ownerId === null
      && run.fencingToken === command.fencingToken;
    if (!owned && !gateOpenerFinishing) {
      throw new Error("Stale Agent Run owner");
    }
    run.snapshotVersion += 1;
    this.appendEvent(run, command.type, command.payload);
    return { ...this.eventsByRun.get(run.id)!.at(-1)!, payload: { ...command.payload } };
  }

  async heartbeat(command: HeartbeatAgentRunCommand): Promise<AgentRunSnapshot> {
    const run = this.runsById.get(command.runId);
    if (!run) throw new Error("Agent Run not found");
    if (run.ownerId !== command.workerId || run.fencingToken !== command.fencingToken) {
      throw new Error("Stale Agent Run owner");
    }
    if (isTerminalAgentRunStatus(run.status) || run.status === "waiting_user" || run.status === "queued" || run.status === "cancel_requested") {
      throw new Error("Agent Run is not heartbeat eligible");
    }
    const now = command.now || new Date();
    run.heartbeatAt = now.toISOString();
    run.leaseExpiresAt = new Date(now.getTime() + (command.leaseMs ?? 30_000)).toISOString();
    run.updatedAt = now.toISOString();
    return { ...run, budgets: { ...run.budgets } };
  }

  async listRuns(
    principal: ExecutionPrincipal,
    options: { conversationId?: number; activeOnly?: boolean; limit?: number } = {},
  ): Promise<AgentRunSnapshot[]> {
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    return Array.from(this.runsById.values())
      .filter((run) => run.userId === principal.userId)
      .filter((run) => options.conversationId === undefined || run.conversationId === options.conversationId)
      .filter((run) => !options.activeOnly || !isTerminalAgentRunStatus(run.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map((run) => ({ ...run, budgets: { ...run.budgets } }));
  }

  private appendEvent(
    run: AgentRunSnapshot,
    type: string,
    payload: Record<string, unknown>,
    now = new Date(),
  ): void {
    run.eventCursor += 1;
    run.updatedAt = now.toISOString();
    const events = this.eventsByRun.get(run.id) || [];
    events.push({
      runId: run.id,
      userId: run.userId,
      sequence: run.eventCursor,
      type,
      schemaVersion: 1,
      payload,
      createdAt: now.toISOString(),
    });
    this.eventsByRun.set(run.id, events);
  }

  private cloneCheckpoint(checkpoint: AgentRunCheckpoint): AgentRunCheckpoint {
    return {
      ...checkpoint,
      context: { ...checkpoint.context },
      plan: { ...checkpoint.plan },
      budgets: { ...checkpoint.budgets },
      factRefs: checkpoint.factRefs.map((reference) => ({ ...reference })),
    };
  }

  private cloneGate(gate: AgentRunGate): AgentRunGate {
    return {
      ...gate,
      request: { ...gate.request },
      response: { ...gate.response },
    };
  }

  private cloneInput(input: AgentRunInputRecord): AgentRunInputRecord {
    return {
      ...input,
      content: { ...input.content, images: input.content.images ? [...input.content.images] : undefined },
    };
  }
}
