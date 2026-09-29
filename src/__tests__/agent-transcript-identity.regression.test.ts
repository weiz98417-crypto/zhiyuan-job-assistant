import { describe, expect, it } from "vitest";
import { mergeServerTranscript } from "@/lib/agent/transcript-merge";
import { projectDurableUiEvent } from "@/lib/agent/runtime/run-event-projection";
import { projectConversationItems, conversationItemsToAgentMessages } from "@/lib/agent/item-projection";
import { projectAgentMessages } from "@/lib/agent/surface-projection";
import type { AgentMessage } from "@/types";

describe("durable transcript identity regressions", () => {
  it("carries the canonical tool item id through the durable UI event", () => {
    const event = projectDurableUiEvent({
      type: "tool_result",
      itemId: "run-123:tool:0",
      name: "scan_portals",
      success: true,
      uiPayload: { type: "job_discovery_confirmation", criteria: { location: "全国" } },
    });

    expect(event.itemId).toBe("run-123:tool:0");
  });

  it("uses the event item id for read-back conversation cards", () => {
    const items = projectConversationItems({
      conversationId: 17,
      runId: "run-123",
      events: [{
        runId: "run-123",
        sequence: 8,
        type: "run.ui_event",
        createdAt: "2026-09-28T10:00:00.000Z",
        payload: {
          event: {
            type: "tool_result",
            itemId: "run-123:tool:0",
            name: "scan_portals",
            success: true,
            safeView: {
              kind: "card",
              toolName: "scan_portals",
              status: "success",
              label: "岗位发现",
              summary: "已生成岗位发现确认卡",
              uiPayload: { type: "job_discovery_confirmation", criteria: { location: "全国" } },
            },
          },
        },
      }],
    });

    expect(items).toHaveLength(1);
    expect(items[0].itemId).toBe("run-123:tool:0");
    expect(conversationItemsToAgentMessages(items)[0].itemId).toBe("run-123:tool:0");
  });

  it("drops a live confirmation card when read-back has the same run item", () => {
    const payload = {
      type: "job_discovery_confirmation",
      criteria: { titlePositive: ["AI 产品经理"], location: "全国", maxResults: 50 },
    };
    const local = [{
      itemId: "run-123:tool:0",
      role: "tool",
      toolName: "scan_portals",
      content: "已生成岗位发现确认卡",
      timestamp: "2026-09-28T10:00:01.000Z",
      toolResult: { durableRunId: "run-123", uiPayload: payload },
    }];
    const server = [{
      itemId: "memory-row-1",
      role: "tool",
      toolName: "scan_portals",
      content: "已生成岗位发现确认卡",
      timestamp: "2026-09-28T10:00:02.000Z",
      toolResult: { durableRunId: "run-123", uiPayload: payload },
    }];

    expect(mergeServerTranscript(local, server)).toEqual(server);
  });

  it("shows one confirmation card when a run records the same result twice", () => {
    const confirmation = (itemId: string, runId: string, location = "杭州"): AgentMessage => ({
      itemId,
      role: "tool",
      toolName: "scan_portals",
      content: "已生成岗位发现确认卡",
      timestamp: "2026-09-28T10:00:01.000Z",
      toolResult: {
        durableRunId: runId,
        uiPayload: { type: "job_discovery_confirmation", criteria: { location, maxResults: 1 } },
      },
    });
    const messages = [
      confirmation("run-123:tool:8", "run-123"),
      confirmation("run-123:tool:13", "run-123"),
      confirmation("run-456:tool:4", "run-456"),
      confirmation("run-123:tool:17", "run-123", "上海"),
    ];

    const projected = projectAgentMessages(messages);
    expect(projected.map((message) => message.itemId)).toEqual([
      "run-123:tool:13",
      "run-456:tool:4",
      "run-123:tool:17",
    ]);
    expect(projectAgentMessages(projected)).toEqual(projected);
  });
});
