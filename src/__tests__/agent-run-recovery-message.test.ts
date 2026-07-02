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

  it("describes running recovery as a status check, not a repeated execution", () => {
    const content = buildRunRecoveryMessage({
      run: {
        id: "1ce2be63-d220-48b0-913a-e707aa6898c5",
        user_id: "user-1",
        session_id: 1,
        task_type: "jd_evaluation",
        agent_id: "evaluate",
        status: "running",
        created_at: "2026-06-16T00:00:00.000Z",
        updated_at: "2026-06-16T00:00:01.000Z",
      },
      steps: [{
        id: 1,
        run_id: "1ce2be63-d220-48b0-913a-e707aa6898c5",
        phase: "archetype_detected",
        tool_name: "",
        status: "running",
        input_summary: "",
        output_summary: "",
        created_at: "2026-06-16T00:00:01.000Z",
      }],
    });

    expect(content).toContain("已查看 Agent run #1ce2be63 的运行状态");
    expect(content).toContain("最近一步：archetype_detected");
    expect(content).toContain("不会自动重跑");
    expect(content).not.toContain("已恢复 Agent run");
  });
});
