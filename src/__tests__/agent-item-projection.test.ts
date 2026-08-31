import { describe, expect, it } from "vitest";
import { AgentItemAssembler, projectConversationItems } from "@/lib/agent/item-projection";
import { InMemoryConversationItemStore } from "@/lib/agent/conversation-item-store";

describe("agent item lifecycle projection", () => {
  it("updates one stable item for multiple deltas", () => {
    const assembler = new AgentItemAssembler("run-1");
    assembler.apply({ cursor: 1, type: "started", itemId: "assistant-1" });
    assembler.apply({ cursor: 2, type: "delta", itemId: "assistant-1", content: "你好" });
    assembler.apply({ cursor: 3, type: "delta", itemId: "assistant-1", content: "，世界" });
    const item = assembler.apply({ cursor: 4, type: "completed", itemId: "assistant-1" });
    expect(item?.itemId).toBe("assistant-1");
    expect(item?.content).toBe("你好，世界");
    expect(assembler.snapshot()).toHaveLength(1);
  });

  it("ignores duplicate cursor replay", () => {
    const assembler = new AgentItemAssembler("run-2");
    assembler.apply({ cursor: 1, type: "delta", content: "一次" });
    expect(assembler.apply({ cursor: 1, type: "delta", content: "一次" })).toBeNull();
    expect(assembler.snapshot()[0]?.content).toBe("一次");
  });

  it("hides empty completed and tool-only transcript items", () => {
    const assembler = new AgentItemAssembler("run-3");
    assembler.apply({ cursor: 1, type: "started", itemId: "empty" });
    assembler.apply({ cursor: 2, type: "completed", itemId: "empty", content: "  " });
    expect(assembler.snapshot()).toEqual([]);
  });

  it("keeps interrupted text but exposes one recoverable state without text", () => {
    const withText = new AgentItemAssembler("run-4");
    withText.apply({ cursor: 1, type: "delta", itemId: "text", content: "已输出" });
    const interrupted = withText.apply({ cursor: 2, type: "interrupted", itemId: "text" });
    expect(interrupted?.content).toBe("已输出");
    expect(interrupted?.status).toBe("interrupted");

    const withoutText = new AgentItemAssembler("run-5");
    const recoverable = withoutText.apply({ cursor: 1, type: "interrupted", itemId: "empty" });
    expect(recoverable?.status).toBe("interrupted");
    expect(withoutText.snapshot()).toHaveLength(1);
  });

  it("projects assistant final text into the transcript", () => {
    const assembler = new AgentItemAssembler("run-6");
    assembler.apply({ cursor: 1, type: "delta", itemId: "answer", content: "诊断完成" });
    assembler.apply({ cursor: 2, type: "completed", itemId: "answer" });
    expect(assembler.surfaceEvents()).toEqual([
      expect.objectContaining({
        itemId: "answer",
        audience: "user_transcript",
        content: "诊断完成",
      }),
    ]);
  });

  it("projects durable events into ordered, idempotent conversation items", () => {
    const events = [
      {
        runId: "run-7", userId: "user-7", sequence: 1, type: "run.created", schemaVersion: 1,
        payload: { status: "queued" }, createdAt: "2026-08-31T00:00:00.000Z",
      },
      {
        runId: "run-7", userId: "user-7", sequence: 2, type: "run.ui_event", schemaVersion: 1,
        payload: { event: { type: "text", content: "已完成分析。" } }, createdAt: "2026-08-31T00:00:01.000Z",
      },
      {
        runId: "run-7", userId: "user-7", sequence: 3, type: "run.ui_event", schemaVersion: 1,
        payload: { event: { type: "tool_result", name: "evaluate_jd_full", success: true, safeView: {
          kind: "card", toolName: "evaluate_jd_full", status: "success", label: "JD 评估已完成", summary: "JD 评估已完成",
          uiPayload: { type: "jd_report", reportId: 12, version: 2, hash: "h12" }, artifact: { id: 12, version: 2, hash: "h12" },
        } } }, createdAt: "2026-08-31T00:00:02.000Z",
      },
      {
        runId: "run-7", userId: "user-7", sequence: 4, type: "run.gate_opened", schemaVersion: 1,
        payload: { gateId: "gate-7", toolName: "save_resume_section", risk: "high", scopeHash: "scope-7", request: { userVisibleName: "保存简历" } },
        createdAt: "2026-08-31T00:00:03.000Z",
      },
      {
        runId: "run-7", userId: "user-7", sequence: 5, type: "run.gate_resolved", schemaVersion: 1,
        payload: { gateId: "gate-7", status: "approved", scopeHash: "scope-7", resolvedAt: "2026-08-31T00:00:04.000Z" },
        createdAt: "2026-08-31T00:00:04.000Z",
      },
      {
        runId: "run-7", userId: "user-7", sequence: 6, type: "run.status_changed", schemaVersion: 1,
        payload: { status: "succeeded" }, createdAt: "2026-08-31T00:00:05.000Z",
      },
    ];

    const first = projectConversationItems({ conversationId: 7, runId: "run-7", events });
    const replayed = projectConversationItems({ conversationId: 7, runId: "run-7", events: [...events, ...events] });
    expect(replayed).toEqual(first);
    expect(first.map((item) => item.type)).toEqual([
      "assistant_text", "artifact_card", "run_gate", "run_terminal",
    ]);
    expect(first.find((item) => item.type === "run_gate")).toMatchObject({
      displayState: "resolved",
      payload: expect.objectContaining({ status: "approved" }),
    });
    expect(first.find((item) => item.type === "artifact_card")?.payload).toEqual(expect.objectContaining({
      type: "jd_report", reportId: 12,
    }));
    expect(JSON.stringify(first)).not.toContain("scopeHash");
  });

  it("does not project stale or unverified artifact cards", () => {
    const items = projectConversationItems({
      conversationId: 8,
      runId: "run-8",
      events: [{
        runId: "run-8", userId: "user-8", sequence: 1, type: "run.ui_event", schemaVersion: 1,
        payload: { event: { type: "tool_result", name: "export_file", success: true, safeView: {
          kind: "card", toolName: "export_file", status: "success", label: "已生成导出文件", summary: "已生成导出文件",
          uiPayload: { type: "export_artifact", artifactId: "a1", version: 1, hash: "bad", stale: true },
          artifact: { id: "a1", version: 1, hash: "bad", stale: true },
        } } }, createdAt: "2026-08-31T00:00:00.000Z",
      }],
      artifacts: [{ id: "a1", version: 1, hash: "good", ownerId: "other", verified: false, stale: true }],
    });
    expect(items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "artifact_card" }),
    ]));
  });

  it("persists items idempotently and enforces owner-scoped reads", async () => {
    const store = new InMemoryConversationItemStore();
    const item = projectConversationItems({
      conversationId: 9,
      runId: "run-9",
      events: [{ runId: "run-9", sequence: 1, type: "run.ui_event", payload: { event: { type: "text", content: "已完成" } }, createdAt: "2026-01-01T00:00:00.000Z" }],
    })[0]!;
    await store.upsert("user-9", item);
    await store.upsert("user-9", { ...item, payload: { content: "已完成更新" }, updatedAt: "2026-01-01T00:00:01.000Z" });
    expect((await store.list("user-9"))[0]?.payload.content).toBe("已完成更新");
    expect(await store.list("other-user")).toEqual([]);
  });
});
