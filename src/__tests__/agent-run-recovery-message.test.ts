import { describe, expect, it } from "vitest";
import {
  buildRunRecoveryMessage,
  upsertRunRecoveryStatusMessage,
} from "@/lib/agent/run-recovery-message";
import type { AgentMessage } from "@/types";

describe("agent run recovery status messages", () => {
  it("updates the existing recovery status message for the same run instead of appending duplicates", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "帮我评估这个 JD", timestamp: "2026-06-16T00:00:00.000Z" },
    ];

    const once = upsertRunRecoveryStatusMessage(
      messages,
      "1ce2be63-d220-48b0-913a-e707aa6898c5",
      "first status",
      "2026-06-16T00:00:01.000Z",
    );
    const twice = upsertRunRecoveryStatusMessage(
      once,
      "1ce2be63-d220-48b0-913a-e707aa6898c5",
      "second status",
      "2026-06-16T00:00:02.000Z",
    );

    expect(twice).toHaveLength(2);
    expect(twice[1]).toMatchObject({
      role: "assistant",
      content: "second status",
      toolName: "agent_run_status",
    });
    expect(JSON.stringify(twice)).toContain("agent-run-recovery:1ce2be63-d220-48b0-913a-e707aa6898c5");
    expect(JSON.stringify(twice)).not.toContain("first status");
  });

  it("describes a running durable Run as continuing from checkpoints", () => {
    const content = buildRunRecoveryMessage({
      id: "1ce2be63-d220-48b0-913a-e707aa6898c5",
      userId: "user-1",
      conversationId: 1,
      requestId: "request-1",
      taskType: "jd_evaluation",
      agentId: "evaluate",
      status: "recovering",
      snapshotVersion: 4,
      eventCursor: 9,
      contract: {},
      budgets: {},
      runtimeMode: "worker_all",
      parentRunId: null,
      depth: 0,
      ownerId: null,
      fencingToken: 2,
      heartbeatAt: "2026-06-16T00:00:01.000Z",
      leaseExpiresAt: "2026-06-16T00:00:31.000Z",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:01.000Z",
    });

    expect(content).toContain("已查看 Agent run #1ce2be63 的运行状态");
    expect(content).toContain("事件游标：9");
    expect(content).toContain("Worker 会从最近的安全检查点继续");
    expect(content).not.toContain("已恢复 Agent run");
  });
});
