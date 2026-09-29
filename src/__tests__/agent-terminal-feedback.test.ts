import { describe, expect, it } from "vitest";
import { ensureTerminalRunFeedback } from "@/lib/agent/run-recovery-message";
import type { AgentMessage } from "@/types";

const user = (content: string, timestamp: string): AgentMessage => ({ role: "user", content, timestamp });
const assistant = (content: string, timestamp: string): AgentMessage => ({ role: "assistant", content, timestamp });
const run = { id: "run-1", createdAt: "2026-09-29T10:00:00Z" };

describe("terminal Agent Run feedback", () => {
  it("shows a safe failure message even when the worker persisted no reply", () => {
    const result = ensureTerminalRunFeedback(
      [user("你好", "2026-09-29T10:00:01Z")],
      { ...run, status: "failed" },
      "2026-09-29T10:00:05Z",
    );
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ role: "assistant", itemId: "run-terminal:run-1" });
    expect(result[1].content).toContain("未成功完成");
  });

  it("shows one no-reply message for a succeeded run without assistant text", () => {
    const input = [user("你好", "2026-09-29T10:00:01Z")];
    const first = ensureTerminalRunFeedback(input, { ...run, status: "succeeded" }, "2026-09-29T10:00:05Z");
    const second = ensureTerminalRunFeedback(first, { ...run, status: "succeeded" }, "2026-09-29T10:00:06Z");
    expect(second).toHaveLength(2);
    expect(second[1].content).toContain("没有收到可展示的回复");
  });

  it("does not mistake a reply to an earlier turn for this turn's reply", () => {
    const result = ensureTerminalRunFeedback([
      user("早上好", "2026-09-29T10:00:01Z"),
      assistant("早上好", "2026-09-29T10:00:02Z"),
      user("你好", "2026-09-29T10:00:03Z"),
    ], { ...run, status: "succeeded" }, "2026-09-29T10:00:05Z");
    expect(result.at(-1)?.itemId).toBe("run-terminal:run-1");
  });

  it("removes a provisional no-reply notice when the reply becomes visible", () => {
    const feedback = ensureTerminalRunFeedback(
      [user("你好", "2026-09-29T10:00:01Z")],
      { ...run, status: "succeeded" },
      "2026-09-29T10:00:05Z",
    );
    const result = ensureTerminalRunFeedback([
      ...feedback.slice(0, 1),
      assistant("你好，有什么可以帮你？", "2026-09-29T10:00:04Z"),
      ...feedback.slice(1),
    ], { ...run, status: "succeeded" }, "2026-09-29T10:00:06Z");
    expect(result).toHaveLength(2);
    expect(result[1].content).toBe("你好，有什么可以帮你？");
  });

  it("keeps feedback with its run when a later turn has already started", () => {
    const result = ensureTerminalRunFeedback([
      user("第一条", "2026-09-29T10:00:01Z"),
      user("第二条", "2026-09-29T10:01:00Z"),
      assistant("第二条的回答", "2026-09-29T10:01:02Z"),
    ], { ...run, status: "succeeded", updatedAt: "2026-09-29T10:00:05Z" }, "2026-09-29T10:00:05Z");
    expect(result.map((message) => message.content)).toEqual([
      "第一条",
      expect.stringContaining("没有收到可展示的回复"),
      "第二条",
      "第二条的回答",
    ]);
  });

  it("keeps an immediate no-reply notice when the next turn starts before read-back", () => {
    const terminalRun = { ...run, status: "succeeded", updatedAt: "2026-09-29T10:00:05Z" };
    const first = ensureTerminalRunFeedback(
      [user("第一条", "2026-09-29T10:00:01Z")],
      terminalRun,
      terminalRun.updatedAt,
    );
    const nextTurn = [...first, user("第二条", "2026-09-29T10:00:06Z")];
    const stillPending = ensureTerminalRunFeedback(nextTurn, terminalRun, terminalRun.updatedAt);
    expect(stillPending.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(stillPending[1].itemId).toBe("run-terminal:run-1");

    const withReadBack = ensureTerminalRunFeedback([
      user("第一条", "2026-09-29T10:00:01Z"),
      assistant("第一条的回答", "2026-09-29T10:00:04Z"),
      ...stillPending.slice(1),
    ], terminalRun, terminalRun.updatedAt);
    expect(withReadBack.map((message) => message.content)).toEqual([
      "第一条",
      "第一条的回答",
      "第二条",
    ]);
  });

  it("does not count pause or recovery status as an assistant reply", () => {
    const result = ensureTerminalRunFeedback([
      user("你好", "2026-09-29T10:00:01Z"),
      { ...assistant("任务暂停中", "2026-09-29T10:00:02Z"), itemId: "status:pause" },
      { ...assistant("已查看运行状态", "2026-09-29T10:00:03Z"), toolName: "agent_run_status" },
    ], { ...run, status: "succeeded" }, "2026-09-29T10:00:05Z");
    expect(result.at(-1)?.itemId).toBe("run-terminal:run-1");
  });

  it("shows missing-reply feedback when local error notices are the only assistant messages", () => {
    const result = ensureTerminalRunFeedback([
      user("你好", "2026-09-29T10:00:01Z"),
      { ...assistant("这条消息暂时未确认送达，请重新发送。", "2026-09-29T10:00:02Z"), itemId: "status:input-error" },
      { ...assistant("停止请求暂未成功，任务可能仍在运行。", "2026-09-29T10:00:03Z"), itemId: "status:cancel-error" },
    ], { ...run, status: "succeeded", updatedAt: "2026-09-29T10:00:05Z" }, "2026-09-29T10:00:05Z");

    expect(result.map((message) => message.itemId)).toEqual([
      undefined,
      "status:input-error",
      "status:cancel-error",
      "run-terminal:run-1",
    ]);
    expect(result.at(-1)?.content).toContain("没有收到可展示的回复");
  });
});
