import type {
  AgentRunCheckpoint,
  AgentRunSnapshot,
  DurableAgentRunService,
} from "@/lib/agent/runtime/durable-agent-run";
import type { AgentRuntimeObservation } from "@/lib/agent/runtime/observation";
import {
  RecoverySupervisor,
  type RecoveryBudgetState,
} from "@/lib/agent/runtime/recovery-supervisor";

export interface AgentRunExecutionResult {
  outcome: "succeeded" | "waiting_user" | "failed";
}

export interface AgentRunExecutionEngine {
  execute(input: {
    run: AgentRunSnapshot;
    checkpoint: AgentRunCheckpoint | null;
    signal: AbortSignal;
  }): Promise<AgentRunExecutionResult>;
}

export interface AgentWorkerOptions {
  workerId: string;
  runtime: DurableAgentRunService;
  engine: AgentRunExecutionEngine;
  recoverySupervisor?: RecoverySupervisor;
  shouldPauseClaims?: () => boolean | Promise<boolean>;
  reconcileOutstanding?: (input: {
    principal: { userId: string };
    runId: string;
    workerId: string;
    fencingToken: number;
    signal: AbortSignal;
  }) => Promise<{ resolved: number; unresolved: number }>;
  attemptDeadlineMs?: number;
}

export interface AgentWorkerLoopOptions {
  concurrency?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  waitForWork?: (signal?: AbortSignal) => Promise<void>;
}

export class AgentWorker {
  private readonly recoverySupervisor: RecoverySupervisor;
  private draining = false;

  constructor(private readonly options: AgentWorkerOptions) {
    this.recoverySupervisor = options.recoverySupervisor || new RecoverySupervisor();
  }

  drain(): void {
    this.draining = true;
  }

  async runForever(options: AgentWorkerLoopOptions = {}): Promise<void> {
    const concurrency = Math.max(1, Math.floor(options.concurrency || 2));
    const pollIntervalMs = Math.max(1, Math.floor(options.pollIntervalMs || 1_000));
    const active = new Set<Promise<AgentRunSnapshot | null>>();

    const launch = () => {
      const task = this.runOnce().finally(() => active.delete(task));
      active.add(task);
    };

    while (!this.draining && !options.signal?.aborted) {
      while (active.size < concurrency && !this.draining && !options.signal?.aborted) launch();
      if (active.size === 0) break;
      const result = await Promise.race(active);
      if (result === null && !this.draining && !options.signal?.aborted) {
        if (options.waitForWork) await options.waitForWork(options.signal);
        else await delay(pollIntervalMs, options.signal);
      }
    }

    await Promise.allSettled(active);
  }

  async runOnce(): Promise<AgentRunSnapshot | null> {
    if (this.draining) return null;
    if (await this.options.shouldPauseClaims?.()) return null;
    const run = await this.options.runtime.claimNextRun({ workerId: this.options.workerId });
    if (!run) return null;
    if (run.status === "cancel_requested") {
      return this.options.runtime.transitionRun({
        runId: run.id,
        workerId: this.options.workerId,
        fencingToken: run.fencingToken,
        nextStatus: "cancelled",
      });
    }

    const principal = { userId: run.userId };
    const attemptStartedAt = Date.now();
    const checkpoint = await this.options.runtime.getLatestCheckpoint(principal, run.id);
    const controller = new AbortController();
    const budgets = budgetState(checkpoint?.budgets || run.budgets);
    const attemptDeadlineMs = Math.max(1, this.options.attemptDeadlineMs || 180_000);
    const deadlineTimer = setTimeout(() => {
      controller.abort(new Error("provider timeout: model attempt deadline exceeded"));
    }, attemptDeadlineMs);
    const heartbeatTimer = setInterval(() => {
      void this.options.runtime.heartbeat({
        runId: run.id,
        workerId: this.options.workerId,
        fencingToken: run.fencingToken,
        leaseMs: 30_000,
      }).catch(() => controller.abort());
    }, 10_000);

    try {
      await this.options.runtime.saveCheckpoint({
        runId: run.id,
        workerId: this.options.workerId,
        fencingToken: run.fencingToken,
        boundary: "before_model",
        context: checkpoint?.context || {},
        plan: checkpoint?.plan || {},
      budgets: serializeBudgets(budgets),
      factRefs: checkpoint?.factRefs || [],
      });
      const reconciliation = await this.options.reconcileOutstanding?.({
        principal,
        runId: run.id,
        workerId: this.options.workerId,
        fencingToken: run.fencingToken,
        signal: controller.signal,
      });
      if (reconciliation && reconciliation.unresolved > 0) {
        await this.options.runtime.transitionRun({
          runId: run.id,
          workerId: this.options.workerId,
          fencingToken: run.fencingToken,
          nextStatus: "recovering",
        });
        return this.options.runtime.transitionRun({
          runId: run.id,
          workerId: this.options.workerId,
          fencingToken: run.fencingToken,
          nextStatus: "waiting_user",
        });
      }
      const execution = this.options.engine.execute({ run, checkpoint, signal: controller.signal });
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(controller.signal.reason instanceof Error
            ? controller.signal.reason
            : new Error("Agent execution aborted"));
        }, { once: true });
      });
      const result = await Promise.race([execution, aborted]);
      const currentAfterExecution = await this.options.runtime.getRun(principal, run.id);
      if (currentAfterExecution?.status === "cancel_requested") {
        return this.options.runtime.transitionRun({
          runId: run.id,
          workerId: this.options.workerId,
          fencingToken: run.fencingToken,
          nextStatus: "cancelled",
        });
      }
      if (result.outcome === "waiting_user") {
        if (currentAfterExecution?.status === "waiting_user" || currentAfterExecution?.status === "queued") {
          return currentAfterExecution;
        }
        return this.options.runtime.transitionRun({
          runId: run.id,
          workerId: this.options.workerId,
          fencingToken: run.fencingToken,
          nextStatus: "waiting_user",
        });
      }
      if (result.outcome === "failed") {
        return this.options.runtime.transitionRun({
          runId: run.id,
          workerId: this.options.workerId,
          fencingToken: run.fencingToken,
          nextStatus: "failed",
        });
      }
      try {
        await this.options.runtime.transitionRun({
          runId: run.id,
          workerId: this.options.workerId,
          fencingToken: run.fencingToken,
          nextStatus: "verifying",
        });
        return this.options.runtime.transitionRun({
          runId: run.id,
          workerId: this.options.workerId,
          fencingToken: run.fencingToken,
          nextStatus: "succeeded",
        });
      } catch (error) {
        const current = await this.options.runtime.getRun(principal, run.id);
        if (current?.status === "cancel_requested") {
          return this.options.runtime.transitionRun({
            runId: run.id,
            workerId: this.options.workerId,
            fencingToken: run.fencingToken,
            nextStatus: "cancelled",
          });
        }
        throw error;
      }
    } catch (error) {
      const observation = observationFromError(error);
      const latestCheckpoint = await this.options.runtime.getLatestCheckpoint(principal, run.id);
      const currentBudgets = budgetState(latestCheckpoint?.budgets || checkpoint?.budgets || run.budgets);
      const nextBudgets = consumeRecoveryBudget(
        currentBudgets,
        observation.fingerprint,
        Date.now() - attemptStartedAt,
      );
      const decision = this.recoverySupervisor.decide(observation, nextBudgets);
      const decidedBudgets = recordRecoveryAction(nextBudgets, decision.action);
      await this.options.runtime.recordEvent({
        runId: run.id,
        workerId: this.options.workerId,
        fencingToken: run.fencingToken,
        type: "run.recovery_decided",
        payload: { observation, decision },
      });
      await this.options.runtime.saveCheckpoint({
        runId: run.id,
        workerId: this.options.workerId,
        fencingToken: run.fencingToken,
        boundary: "recovery_observed",
        context: {
          ...(latestCheckpoint?.context || checkpoint?.context || {}),
          recovery: { observation, decision },
        },
        plan: latestCheckpoint?.plan || checkpoint?.plan || {},
        budgets: serializeBudgets(decidedBudgets),
        factRefs: latestCheckpoint?.factRefs || checkpoint?.factRefs || [],
      });
      if (decision.terminal) {
        return this.options.runtime.transitionRun({
          runId: run.id,
          workerId: this.options.workerId,
          fencingToken: run.fencingToken,
          nextStatus: "failed",
        });
      }
      await this.options.runtime.transitionRun({
        runId: run.id,
        workerId: this.options.workerId,
        fencingToken: run.fencingToken,
        nextStatus: "recovering",
      });
      return this.options.runtime.transitionRun({
        runId: run.id,
        workerId: this.options.workerId,
        fencingToken: run.fencingToken,
        nextStatus: decision.nextStatus === "waiting_user" ? "waiting_user" : "queued",
      });
    } finally {
      clearTimeout(deadlineTimer);
      clearInterval(heartbeatTimer);
    }
  }
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function observationFromError(error: unknown): AgentRuntimeObservation {
  const message = error instanceof Error ? error.message : "Agent execution failed";
  const lower = message.toLowerCase();
  const contextOverflow = /context length|context window|maximum context|too many tokens|token limit/.test(lower);
  const category: AgentRuntimeObservation["category"] = contextOverflow
    ? "provider"
    : /timeout|network|connection|socket|econnreset|429|5\d\d/.test(lower)
      ? "provider"
      : /contract unmet/.test(lower)
        ? "contract_unmet"
        : /invalid (argument|parameter)|missing required|json|validation/.test(lower)
          ? "tool_validation"
          : /postgres|database|deadlock|serialization/.test(lower)
            ? "database"
            : /tool/.test(lower)
              ? "tool_transient"
              : "unknown";
  const recoveryCapabilities = contextOverflow
    ? ["compact_context", "switch_provider"]
    : category === "provider"
      ? ["retry", "switch_provider"]
      : category === "tool_validation"
        ? ["parameter_repair", "safe_tool_replan"]
        : ["safe_tool_replan"];
  return {
    category,
    stage: "model_attempt",
    retryability: category === "provider" && !contextOverflow ? "retry" : "replan",
    effectState: "not_dispatched",
    fingerprint: `${category}:${lower.replace(/\d+/g, "#").slice(0, 120)}`,
    userSafeSummary: contextOverflow
      ? "上下文超过模型窗口，正在压缩后继续"
      : category === "provider"
        ? "模型服务暂时不可用，正在尝试其他路径"
        : "执行遇到问题，正在尝试尚未使用的安全路径",
    diagnosticRef: "agent-worker",
    recoveryCapabilities,
  };
}

function budgetState(value: Record<string, unknown>): RecoveryBudgetState {
  return {
    modelAttempts: numberValue(value.modelAttempts),
    sameToolArgsAttempts: numberValue(value.sameToolArgsAttempts),
    fingerprintRecoveries: value.fingerprintRecoveries && typeof value.fingerprintRecoveries === "object"
      ? Object.fromEntries(Object.entries(value.fingerprintRecoveries as Record<string, unknown>).map(([key, item]) => [key, numberValue(item)]))
      : {},
    noProgressCycles: numberValue(value.noProgressCycles),
    modelCycles: numberValue(value.modelCycles),
    activeWallMs: numberValue(value.activeWallMs),
    tokenUsed: numberValue(value.tokenUsed),
    estimatedCostUsd: numberValue(value.estimatedCostUsd),
    delegationCount: numberValue(value.delegationCount),
    actionAttempts: value.actionAttempts && typeof value.actionAttempts === "object"
      ? Object.fromEntries(Object.entries(value.actionAttempts as Record<string, unknown>).map(([key, item]) => [key, numberValue(item)]))
      : {},
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function serializeBudgets(value: RecoveryBudgetState): Record<string, unknown> {
  return {
    modelAttempts: value.modelAttempts,
    sameToolArgsAttempts: value.sameToolArgsAttempts,
    fingerprintRecoveries: { ...value.fingerprintRecoveries },
    noProgressCycles: value.noProgressCycles,
    modelCycles: value.modelCycles,
    activeWallMs: value.activeWallMs,
    tokenUsed: value.tokenUsed,
    estimatedCostUsd: value.estimatedCostUsd,
    delegationCount: value.delegationCount,
    actionAttempts: { ...(value.actionAttempts || {}) },
  };
}

function recordRecoveryAction(
  budgets: RecoveryBudgetState,
  action: ReturnType<RecoverySupervisor["decide"]>["action"],
): RecoveryBudgetState {
  if (action === "fail") return budgets;
  return {
    ...budgets,
    actionAttempts: {
      ...(budgets.actionAttempts || {}),
      [action]: (budgets.actionAttempts?.[action] || 0) + 1,
    },
  };
}

function consumeRecoveryBudget(
  budgets: RecoveryBudgetState,
  fingerprint: string,
  elapsedMs: number,
): RecoveryBudgetState {
  const previousFingerprintAttempts = budgets.fingerprintRecoveries[fingerprint] || 0;
  return {
    ...budgets,
    modelAttempts: budgets.modelAttempts + 1,
    modelCycles: budgets.modelCycles + 1,
    activeWallMs: budgets.activeWallMs + Math.max(0, elapsedMs),
    noProgressCycles: previousFingerprintAttempts > 0 ? budgets.noProgressCycles + 1 : 0,
    fingerprintRecoveries: {
      ...budgets.fingerprintRecoveries,
      [fingerprint]: previousFingerprintAttempts + 1,
    },
  };
}
