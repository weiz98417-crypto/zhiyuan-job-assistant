import { createHash, randomUUID } from "crypto";
import type { ToolRegistry } from "@/lib/agent/tools/registry";
import type {
  ToolCapability,
  ToolResult,
} from "@/lib/agent/tools/types";
import type {
  AgentRunGate,
  ExecutionPrincipal,
  OpenAgentRunGateCommand,
} from "@/lib/agent/runtime/durable-agent-run";
import type { AgentRuntimeObservation, ToolEffectState } from "@/lib/agent/runtime/observation";
import { createToolGateScope } from "@/lib/agent/runtime/run-gate";
import type {
  AgentBackgroundJobService,
  AgentBackgroundJobSnapshot,
} from "@/lib/agent/runtime/agent-background-job";

export type ToolAttemptStatus =
  | "intent_recorded"
  | "running"
  | "reconciling"
  | "succeeded"
  | "denied"
  | "failed"
  | "waiting_user"
  | "cancelled";

export interface ToolAttemptRecord {
  id: string;
  runId: string;
  userId: string;
  sequence: number;
  toolName: string;
  args?: Record<string, unknown>;
  argsHash: string;
  idempotencyKey: string;
  capability: ToolCapability | null;
  status: ToolAttemptStatus;
  effectState: ToolEffectState;
  result: ToolResult | null;
  observation: AgentRuntimeObservation | null;
  workerId: string;
  fencingToken: number;
  createdAt: string;
  updatedAt: string;
}

export interface BeginToolAttemptInput {
  principal: ExecutionPrincipal;
  runId: string;
  workerId: string;
  fencingToken: number;
  toolName: string;
  args: Record<string, unknown>;
  argsHash: string;
  idempotencyKey: string;
  capability: ToolCapability | null;
}

export interface ToolAttemptStore {
  beginAttempt(input: BeginToolAttemptInput): Promise<{ attempt: ToolAttemptRecord; replayed: boolean }>;
  markAttemptRunning(
    attemptId: string,
    input: { workerId: string; fencingToken: number; effectState: ToolEffectState },
  ): Promise<ToolAttemptRecord>;
  finishAttempt(
    attemptId: string,
    input: Pick<ToolAttemptRecord, "workerId" | "fencingToken" | "status" | "effectState" | "result" | "observation">,
  ): Promise<ToolAttemptRecord>;
  listUncertainAttempts?(
    principal: ExecutionPrincipal,
    runId: string,
  ): Promise<ToolAttemptRecord[]>;
}

export interface ExecuteGovernedToolAttemptInput {
  principal: ExecutionPrincipal;
  runId: string;
  workerId: string;
  fencingToken: number;
  toolName: string;
  args: Record<string, unknown>;
  allowlist: readonly string[];
  idempotencyKey?: string;
  policyDenial?: ToolResult;
  signal?: AbortSignal;
}

export interface GovernedToolAttemptOutcome {
  attempt: ToolAttemptRecord;
  runDirective: "continue" | "recover" | "wait_user";
  observation: AgentRuntimeObservation | null;
}

export interface ToolRunGateRuntime {
  openGate(command: OpenAgentRunGateCommand): Promise<AgentRunGate>;
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
}

export class GovernedToolAttemptExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly store: ToolAttemptStore,
    private readonly backgroundJobs?: AgentBackgroundJobService,
    private readonly gates?: ToolRunGateRuntime,
  ) {}

  async reconcileOutstanding(input: {
    principal: ExecutionPrincipal;
    runId: string;
    workerId: string;
    fencingToken: number;
    signal?: AbortSignal;
  }): Promise<{ resolved: number; unresolved: number }> {
    const attempts = await this.store.listUncertainAttempts?.(input.principal, input.runId) || [];
    let resolved = 0;
    let unresolved = 0;
    for (const attempt of attempts) {
      const outcome = await this.reconcileAttempt({
        principal: input.principal,
        runId: input.runId,
        workerId: input.workerId,
        fencingToken: input.fencingToken,
        toolName: attempt.toolName,
        args: attempt.args || {},
        allowlist: [attempt.toolName],
        idempotencyKey: attempt.idempotencyKey,
        signal: input.signal,
      }, attempt);
      if (outcome.attempt.effectState === "unknown") unresolved += 1;
      else resolved += 1;
    }
    return { resolved, unresolved };
  }

  async execute(input: ExecuteGovernedToolAttemptInput): Promise<GovernedToolAttemptOutcome> {
    const tool = this.registry.get(input.toolName);
    const argsHash = stableHash(input.args);
    const idempotencyKey = input.idempotencyKey
      || stableHash({ runId: input.runId, toolName: input.toolName, argsHash });
    const begun = await this.store.beginAttempt({
      principal: input.principal,
      runId: input.runId,
      workerId: input.workerId,
      fencingToken: input.fencingToken,
      toolName: input.toolName,
      args: input.args,
      argsHash,
      idempotencyKey,
      capability: tool?.capability || null,
    });

    const gateRequired = Boolean(
      this.gates
      && tool?.governance?.requiresUserConfirmation
      && requiresExactRunGate(input.toolName, input.args),
    );
    const gateScopeHash = gateRequired
      ? createToolGateScope(input.toolName, input.args, tool?.capability?.risk || "high")
      : "";
    const gateApproved = gateRequired
      ? await this.gates!.isGateApproved(input.principal, input.runId, gateScopeHash)
      : false;
    const gateDenied = gateRequired
      ? await this.gates!.isGateDenied(input.principal, input.runId, gateScopeHash)
      : false;

    if (
      begun.replayed
      && ["succeeded", "denied", "failed", "waiting_user", "cancelled"].includes(begun.attempt.status)
      && !(begun.attempt.status === "waiting_user" && gateApproved)
    ) {
      if (begun.attempt.status === "waiting_user" && gateDenied) {
        const denialResult: ToolResult = {
          success: false,
          data: { scopeHash: gateScopeHash },
          error: "用户已拒绝此操作",
          errorCategory: "need_user_input",
          recoverable: false,
          uiPayload: {
            type: "run_gate",
            runId: input.runId,
            toolName: input.toolName,
            risk: tool?.capability?.risk || "high",
            scopeHash: gateScopeHash,
            status: "denied",
          },
        };
        const observation = governanceObservation(input.toolName, denialResult.error || "用户已拒绝此操作", begun.attempt.id);
        const attempt = await this.store.finishAttempt(begun.attempt.id, {
          workerId: input.workerId,
          fencingToken: input.fencingToken,
          status: "denied",
          effectState: "not_dispatched",
          result: denialResult,
          observation,
        });
        return { attempt, runDirective: "continue", observation };
      }
      return {
        attempt: begun.attempt,
        runDirective: begun.attempt.status === "waiting_user"
          ? "wait_user"
          : begun.attempt.status === "failed"
            ? "recover"
            : "continue",
        observation: begun.attempt.observation,
      };
    }

    if (gateRequired && !gateApproved && input.allowlist.includes(input.toolName) && !input.policyDenial) {
      const gate = await this.gates!.openGate({
        runId: input.runId,
        workerId: input.workerId,
        fencingToken: input.fencingToken,
        toolName: input.toolName,
        risk: tool?.capability?.risk || "high",
        scopeHash: gateScopeHash,
        request: {
          toolName: input.toolName,
          args: input.args,
          userVisibleName: tool?.governance?.userVisibleNameZh || input.toolName,
        },
      });
      const result: ToolResult = {
        success: false,
        data: {
          gateId: gate.id,
          scopeHash: gate.scopeHash,
          toolName: input.toolName,
        },
        error: "该动作需要用户确认后才能执行",
        errorCategory: "need_user_input",
        recoverable: false,
        llmSummary: "已创建精确作用域的确认请求；请等待用户批准，不要改写参数或绕过确认。",
        uiPayload: {
          type: "run_gate",
          gateId: gate.id,
          runId: input.runId,
          toolName: input.toolName,
          risk: gate.risk,
          scopeHash: gate.scopeHash,
          status: gate.status,
          request: gate.request,
        },
      };
      const observation = governanceObservation(
        input.toolName,
        result.error || "该动作需要用户确认后才能执行",
        begun.attempt.id,
      );
      const attempt = await this.store.finishAttempt(begun.attempt.id, {
        workerId: input.workerId,
        fencingToken: input.fencingToken,
        status: "waiting_user",
        effectState: "not_dispatched",
        result,
        observation,
      });
      return { attempt, runDirective: "wait_user", observation };
    }

    if (!input.allowlist.includes(input.toolName) || input.policyDenial) {
      const denialResult = input.policyDenial || {
        success: false,
        data: null,
        error: "当前 Agent Run 不允许这个动作",
        errorCategory: "permanent" as const,
        recoverable: true,
      };
      const observation = governanceObservation(
        input.toolName,
        denialResult.error || "当前 Agent Run 不允许这个动作",
        begun.attempt.id,
      );
      const attempt = await this.store.finishAttempt(begun.attempt.id, {
        workerId: input.workerId,
        fencingToken: input.fencingToken,
        status: "denied",
        effectState: "not_dispatched",
        result: denialResult,
        observation,
      });
      return {
        attempt,
        runDirective: input.policyDenial?.errorCategory === "need_user_input" ? "wait_user" : "continue",
        observation,
      };
    }

    if (tool?.capability?.workerExecution === "background") {
      return this.executeBackground(input, begun.attempt);
    }

    if (
      begun.replayed
      && ["running", "reconciling"].includes(begun.attempt.status)
      && begun.attempt.effectState === "unknown"
      && begun.attempt.capability?.reconciliation !== "none"
    ) {
      return this.reconcileAttempt(input, begun.attempt);
    }

    const running = await this.store.markAttemptRunning(begun.attempt.id, {
      workerId: input.workerId,
      fencingToken: input.fencingToken,
      effectState: tool?.capability?.reconciliation === "none" ? "not_dispatched" : "unknown",
    });

    const result = await this.registry.execute(input.toolName, input.args, {
      principal: input.principal,
      runId: input.runId,
      allowlist: input.allowlist,
      signal: input.signal,
      requestId: idempotencyKey,
      workerId: input.workerId,
      fencingToken: input.fencingToken,
    });
    const uncertainWrite = !result.success
      && tool?.capability?.reconciliation !== "none"
      && result.errorCategory === "transient";
    if (uncertainWrite) {
      const observation: AgentRuntimeObservation = {
        category: "tool_transient",
        stage: "tool_dispatch",
        retryability: "retry",
        effectState: "unknown",
        fingerprint: `tool:${input.toolName}:unknown_effect`,
        userSafeSummary: "工具执行结果尚未确认，需要先对账",
        diagnosticRef: begun.attempt.id,
        recoveryCapabilities: ["reconcile"],
      };
      const attempt = await this.store.finishAttempt(begun.attempt.id, {
        workerId: input.workerId,
        fencingToken: input.fencingToken,
        status: "reconciling",
        effectState: "unknown",
        result,
        observation,
      });
      return { attempt, runDirective: "recover", observation };
    }
    const status: ToolAttemptStatus = result.success ? "succeeded" : "failed";
    const attempt = await this.store.finishAttempt(begun.attempt.id, {
      workerId: input.workerId,
      fencingToken: input.fencingToken,
      status,
      effectState: result.success
        ? running.capability?.verification === "none" ? "not_executed" : "verified"
        : "not_executed",
      result,
      observation: null,
    });
    return {
      attempt,
      runDirective: result.success ? "continue" : "recover",
      observation: null,
    };
  }

  private async reconcileAttempt(
    input: ExecuteGovernedToolAttemptInput,
    attemptRecord: ToolAttemptRecord,
  ): Promise<GovernedToolAttemptOutcome> {
      const reconciled = await this.registry.reconcile(input.toolName, input.args, {
        principal: input.principal,
        runId: input.runId,
        allowlist: input.allowlist,
        signal: input.signal,
        requestId: input.idempotencyKey || attemptRecord.idempotencyKey,
        workerId: input.workerId,
        fencingToken: input.fencingToken,
      }, attemptRecord.result);
      if (reconciled.state === "verified") {
        const result = reconciled.result || attemptRecord.result || {
          success: true,
          data: { readBackVerified: true },
          errorCategory: "ok" as const,
          llmSummary: reconciled.summary,
        };
        const attempt = await this.store.finishAttempt(attemptRecord.id, {
          workerId: input.workerId,
          fencingToken: input.fencingToken,
          status: "succeeded",
          effectState: "verified",
          result,
          observation: null,
        });
        return { attempt, runDirective: "continue", observation: null };
      }
      if (reconciled.state === "not_executed") {
        const observation = notExecutedObservation(input.toolName, attemptRecord.id, reconciled.summary);
        const attempt = await this.store.finishAttempt(attemptRecord.id, {
          workerId: input.workerId,
          fencingToken: input.fencingToken,
          status: "failed",
          effectState: "not_executed",
          result: attemptRecord.result,
          observation,
        });
        return { attempt, runDirective: "recover", observation };
      }
      const observation = unknownEffectObservation(input.toolName, attemptRecord.id, reconciled.summary);
      const attempt = await this.store.finishAttempt(attemptRecord.id, {
        workerId: input.workerId,
        fencingToken: input.fencingToken,
        status: "reconciling",
        effectState: "unknown",
        result: attemptRecord.result,
        observation,
      });
      return { attempt, runDirective: "recover", observation };
  }

  private async executeBackground(
    input: ExecuteGovernedToolAttemptInput,
    attempt: ToolAttemptRecord,
  ): Promise<GovernedToolAttemptOutcome> {
    if (!this.backgroundJobs) {
      const observation = backgroundObservation(input.toolName, attempt.id, "后台作业运行时未配置");
      const failed = await this.store.finishAttempt(attempt.id, {
        workerId: input.workerId,
        fencingToken: input.fencingToken,
        status: "failed",
        effectState: "not_dispatched",
        result: { success: false, data: null, error: observation.userSafeSummary, errorCategory: "transient", recoverable: true },
        observation,
      });
      return { attempt: failed, runDirective: "recover", observation };
    }

    const running = attempt.status === "running"
      ? attempt
      : await this.store.markAttemptRunning(attempt.id, {
          workerId: input.workerId,
          fencingToken: input.fencingToken,
          effectState: "not_dispatched",
        });
    const jobId = `tool-${attempt.id}`;
    await this.backgroundJobs.createJob(input.principal, {
      id: jobId,
      runId: input.runId,
      toolAttemptId: attempt.id,
      jobType: input.toolName,
      handle: {
        args: input.args,
        allowlist: [...input.allowlist],
        requestId: input.idempotencyKey || attempt.idempotencyKey,
      },
    });

    while (!input.signal?.aborted) {
      const job = await this.backgroundJobs.getJob(input.principal, jobId);
      if (!job) throw new Error("Background job not found");
      if (job.status === "succeeded") return this.finishBackground(input, running, job);
      if (["failed", "cancelled"].includes(job.status)) return this.failBackground(input, running, job);
      await wait(50, input.signal);
    }

    const observation = backgroundObservation(input.toolName, attempt.id, "后台作业仍在运行，将从持久状态继续");
    return { attempt: running, runDirective: "recover", observation };
  }

  private async finishBackground(
    input: ExecuteGovernedToolAttemptInput,
    attempt: ToolAttemptRecord,
    job: AgentBackgroundJobSnapshot,
  ): Promise<GovernedToolAttemptOutcome> {
    const result = toolResultFromJob(job) || {
      success: false,
      data: null,
      error: "后台作业没有返回工具结果",
      errorCategory: "transient" as const,
      recoverable: true,
    };
    const observation = result.success ? null : backgroundObservation(input.toolName, attempt.id, result.error || "后台工具执行失败");
    const finished = await this.store.finishAttempt(attempt.id, {
      workerId: input.workerId,
      fencingToken: input.fencingToken,
      status: result.success ? "succeeded" : "failed",
      effectState: result.success
        ? attempt.capability?.verification === "none" ? "not_executed" : "verified"
        : "not_executed",
      result,
      observation,
    });
    return {
      attempt: finished,
      runDirective: result.success ? "continue" : "recover",
      observation,
    };
  }

  private async failBackground(
    input: ExecuteGovernedToolAttemptInput,
    attempt: ToolAttemptRecord,
    job: AgentBackgroundJobSnapshot,
  ): Promise<GovernedToolAttemptOutcome> {
    const message = String(job.error.message || `后台作业 ${job.status}`);
    const observation = backgroundObservation(input.toolName, attempt.id, message);
    const failed = await this.store.finishAttempt(attempt.id, {
      workerId: input.workerId,
      fencingToken: input.fencingToken,
      status: job.status === "cancelled" ? "cancelled" : "failed",
      effectState: "not_executed",
      result: { success: false, data: null, error: message, errorCategory: "transient", recoverable: true },
      observation,
    });
    return { attempt: failed, runDirective: "recover", observation };
  }
}

function requiresExactRunGate(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName !== "scan_portals") return true;
  return args.confirmed === true || args.userConfirmed === true;
}

export class InMemoryToolAttemptStore implements ToolAttemptStore {
  private readonly attemptsById = new Map<string, ToolAttemptRecord>();
  private readonly attemptsByKey = new Map<string, ToolAttemptRecord>();
  private readonly sequenceByRun = new Map<string, number>();

  async beginAttempt(input: BeginToolAttemptInput): Promise<{ attempt: ToolAttemptRecord; replayed: boolean }> {
    const key = `${input.runId}:${input.idempotencyKey}`;
    const existing = this.attemptsByKey.get(key);
    if (existing) return { attempt: cloneAttempt(existing), replayed: true };

    const now = new Date().toISOString();
    const sequence = (this.sequenceByRun.get(input.runId) || 0) + 1;
    this.sequenceByRun.set(input.runId, sequence);
    const attempt: ToolAttemptRecord = {
      id: randomUUID(),
      runId: input.runId,
      userId: input.principal.userId,
      sequence,
      toolName: input.toolName,
      args: { ...input.args },
      argsHash: input.argsHash,
      idempotencyKey: input.idempotencyKey,
      capability: input.capability ? { ...input.capability } : null,
      status: "intent_recorded",
      effectState: "not_dispatched",
      result: null,
      observation: null,
      workerId: input.workerId,
      fencingToken: input.fencingToken,
      createdAt: now,
      updatedAt: now,
    };
    this.attemptsById.set(attempt.id, attempt);
    this.attemptsByKey.set(key, attempt);
    return { attempt: cloneAttempt(attempt), replayed: false };
  }

  async finishAttempt(
    attemptId: string,
    patch: Pick<ToolAttemptRecord, "workerId" | "fencingToken" | "status" | "effectState" | "result" | "observation">,
  ): Promise<ToolAttemptRecord> {
    const attempt = this.attemptsById.get(attemptId);
    if (!attempt) throw new Error("Tool Attempt not found");
    Object.assign(attempt, patch, { updatedAt: new Date().toISOString() });
    return cloneAttempt(attempt);
  }

  async markAttemptRunning(
    attemptId: string,
    input: { workerId: string; fencingToken: number; effectState: ToolEffectState },
  ): Promise<ToolAttemptRecord> {
    const attempt = this.attemptsById.get(attemptId);
    if (!attempt) throw new Error("Tool Attempt not found");
    attempt.status = "running";
    attempt.effectState = input.effectState;
    attempt.workerId = input.workerId;
    attempt.fencingToken = input.fencingToken;
    attempt.updatedAt = new Date().toISOString();
    return cloneAttempt(attempt);
  }

  async listRunAttempts(runId: string): Promise<ToolAttemptRecord[]> {
    return Array.from(this.attemptsById.values())
      .filter((attempt) => attempt.runId === runId)
      .sort((left, right) => left.sequence - right.sequence)
      .map(cloneAttempt);
  }

  async listUncertainAttempts(principal: ExecutionPrincipal, runId: string): Promise<ToolAttemptRecord[]> {
    return Array.from(this.attemptsById.values())
      .filter((attempt) => attempt.runId === runId && attempt.userId === principal.userId)
      .filter((attempt) => ["running", "reconciling"].includes(attempt.status) && attempt.effectState === "unknown")
      .sort((left, right) => left.sequence - right.sequence)
      .map(cloneAttempt);
  }
}

function governanceObservation(
  toolName: string,
  summary: string,
  diagnosticRef: string,
): AgentRuntimeObservation {
  return {
    category: "governance_denied",
    stage: "tool_policy",
    retryability: "replan",
    effectState: "not_dispatched",
    fingerprint: `governance:${toolName}:allowlist`,
    userSafeSummary: summary,
    diagnosticRef,
    recoveryCapabilities: ["safe_tool_replan"],
  };
}

function unknownEffectObservation(
  toolName: string,
  diagnosticRef: string,
  summary = "上一次工具执行结果尚未确认，需要先对账",
): AgentRuntimeObservation {
  return {
    category: "tool_transient",
    stage: "tool_replay",
    retryability: "retry",
    effectState: "unknown",
    fingerprint: `tool:${toolName}:interrupted_unknown_effect`,
    userSafeSummary: summary,
    diagnosticRef,
    recoveryCapabilities: ["reconcile"],
  };
}

function notExecutedObservation(
  toolName: string,
  diagnosticRef: string,
  summary: string,
): AgentRuntimeObservation {
  return {
    category: "tool_transient",
    stage: "tool_replay",
    retryability: "replan",
    effectState: "not_executed",
    fingerprint: `tool:${toolName}:reconciled_not_executed`,
    userSafeSummary: summary,
    diagnosticRef,
    recoveryCapabilities: ["safe_tool_replan"],
  };
}

function backgroundObservation(toolName: string, diagnosticRef: string, summary: string): AgentRuntimeObservation {
  return {
    category: "tool_transient",
    stage: "background_job",
    retryability: "retry",
    effectState: "not_dispatched",
    fingerprint: `background:${toolName}:${summary.toLowerCase().replace(/\d+/g, "#").slice(0, 80)}`,
    userSafeSummary: summary,
    diagnosticRef,
    recoveryCapabilities: ["retry"],
  };
}

function toolResultFromJob(job: AgentBackgroundJobSnapshot): ToolResult | null {
  const value = job.result.toolResult;
  return value && typeof value === "object" && !Array.isArray(value) ? value as ToolResult : null;
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function cloneAttempt(attempt: ToolAttemptRecord): ToolAttemptRecord {
  return {
    ...attempt,
    capability: attempt.capability ? { ...attempt.capability } : null,
    result: attempt.result ? { ...attempt.result } : null,
    observation: attempt.observation
      ? { ...attempt.observation, recoveryCapabilities: [...attempt.observation.recoveryCapabilities] }
      : null,
  };
}
