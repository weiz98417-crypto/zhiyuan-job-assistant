import { describe, expect, it } from "vitest";
import { RecoverySupervisor } from "@/lib/agent/runtime/recovery-supervisor";

describe("Recovery Supervisor", () => {
  it("replans after governance denies one action without terminating the Run", () => {
    const supervisor = new RecoverySupervisor();

    const decision = supervisor.decide({
      category: "governance_denied",
      stage: "tool_policy",
      retryability: "replan",
      effectState: "not_dispatched",
      fingerprint: "governance:save_resume_section:scope",
      userSafeSummary: "当前写入未获批准",
      diagnosticRef: "observation-1",
      recoveryCapabilities: ["safe_tool_replan", "request_gate"],
    });

    expect(decision).toMatchObject({
      action: "safe_tool_replan",
      nextStatus: "recovering",
      terminal: false,
    });
  });

  it("switches provider after the transient model retry budget is exhausted", () => {
    const supervisor = new RecoverySupervisor();

    const decision = supervisor.decide({
      category: "provider",
      stage: "model_stream",
      retryability: "retry",
      effectState: "not_dispatched",
      fingerprint: "provider:timeout",
      userSafeSummary: "模型连接暂时不可用",
      diagnosticRef: "observation-2",
      recoveryCapabilities: ["retry", "switch_provider"],
    }, {
      modelAttempts: 3,
      sameToolArgsAttempts: 0,
      fingerprintRecoveries: { "provider:timeout": 3 },
      noProgressCycles: 0,
      modelCycles: 3,
      activeWallMs: 4_000,
      tokenUsed: 0,
      estimatedCostUsd: 0,
      delegationCount: 0,
    });

    expect(decision).toMatchObject({
      action: "switch_provider",
      nextStatus: "recovering",
      terminal: false,
    });
  });

  it("reconciles an unknown side effect before any retry", () => {
    const supervisor = new RecoverySupervisor();

    const decision = supervisor.decide({
      category: "tool_transient",
      stage: "tool_result_commit",
      retryability: "retry",
      effectState: "unknown",
      fingerprint: "tool:save_resume_section:connection_lost",
      userSafeSummary: "写入结果尚未确认",
      diagnosticRef: "observation-3",
      recoveryCapabilities: ["retry", "reconcile"],
    });

    expect(decision).toMatchObject({
      action: "reconcile",
      nextStatus: "recovering",
      terminal: false,
    });
  });

  it("stops repeating the same strategy after three no-progress cycles", () => {
    const supervisor = new RecoverySupervisor();

    const decision = supervisor.decide({
      category: "no_progress",
      stage: "model_cycle",
      retryability: "replan",
      effectState: "not_dispatched",
      fingerprint: "progress:snapshot-4:plan-2",
      userSafeSummary: "当前路径没有产生新进展",
      diagnosticRef: "observation-4",
      recoveryCapabilities: ["safe_tool_replan", "request_user"],
    }, {
      modelAttempts: 1,
      sameToolArgsAttempts: 2,
      fingerprintRecoveries: { "progress:snapshot-4:plan-2": 3 },
      noProgressCycles: 3,
      modelCycles: 8,
      activeWallMs: 10_000,
      tokenUsed: 2_000,
      estimatedCostUsd: 0.02,
      delegationCount: 0,
    });

    expect(decision).toMatchObject({
      action: "safe_tool_replan",
      terminal: false,
    });
  });

  it("fails truthfully after the provider fallback strategy is exhausted", () => {
    const supervisor = new RecoverySupervisor();

    const decision = supervisor.decide({
      category: "provider",
      stage: "model_stream",
      retryability: "retry",
      effectState: "not_dispatched",
      fingerprint: "provider:timeout",
      userSafeSummary: "模型连接持续不可用",
      diagnosticRef: "observation-provider-exhausted",
      recoveryCapabilities: ["retry", "switch_provider"],
    }, {
      modelAttempts: 5,
      sameToolArgsAttempts: 0,
      fingerprintRecoveries: { "provider:timeout": 5 },
      noProgressCycles: 0,
      modelCycles: 5,
      activeWallMs: 20_000,
      tokenUsed: 0,
      estimatedCostUsd: 0,
      delegationCount: 0,
      actionAttempts: { switch_provider: 1 },
    });

    expect(decision).toMatchObject({ action: "fail", nextStatus: "failed", terminal: true });
  });

  it("compacts context before retrying a context-window failure", () => {
    const decision = new RecoverySupervisor().decide({
      category: "provider",
      stage: "model_attempt",
      retryability: "replan",
      effectState: "not_dispatched",
      fingerprint: "provider:context_length_exceeded",
      userSafeSummary: "上下文超过模型窗口，正在压缩后继续",
      diagnosticRef: "observation-context",
      recoveryCapabilities: ["compact_context"],
    });

    expect(decision).toMatchObject({ action: "compact_context", terminal: false });
  });
});
