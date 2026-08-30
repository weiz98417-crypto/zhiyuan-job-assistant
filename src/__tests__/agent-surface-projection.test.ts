import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@/types";
import {
  adaptLegacyAgentMessage,
  projectAgentMessages,
  projectToolResultForUser,
  sanitizeSafeReasoningSummary,
} from "@/lib/agent/surface-projection";

describe("agent user-safe surface projection", () => {
  it("hides internal skill text when a tool has no safe view", () => {
    const internal = "自我定位引导完成## 职业方向探索\n4 阶段引导框架已加载";
    const view = projectToolResultForUser({ toolName: "mine_profile", success: true });
    expect(view.kind).toBe("silent");
    expect(JSON.stringify(view)).not.toContain(internal);
  });

  it("keeps only registered structured payloads", () => {
    const view = projectToolResultForUser({
      toolName: "get_profile",
      success: true,
      uiPayload: {
        type: "profile_view_card",
        title: "画像摘要",
        internalPrompt: "system prompt must not pass",
        data: "raw secret",
      },
    });
    expect(view.kind).toBe("card");
    expect(view.uiPayload).toMatchObject({ type: "profile_view_card", title: "画像摘要" });
    expect(view.uiPayload).not.toHaveProperty("internalPrompt");
    expect(view.uiPayload).not.toHaveProperty("data");
  });

  it("uses a field allowlist instead of passing innocuous-looking secrets", () => {
    const view = projectToolResultForUser({
      toolName: "get_profile",
      success: true,
      uiPayload: {
        type: "profile_view_card",
        title: "画像摘要",
        harmlessLookingField: "Bearer production-secret",
        nested: { note: "candidate private contact" },
      },
    });
    expect(view.kind).toBe("card");
    expect(view.uiPayload).toEqual({ type: "profile_view_card", title: "画像摘要" });
  });

  it("redacts credential-like nested strings under approved display fields", () => {
    const view = projectToolResultForUser({
      toolName: "evaluate_jd_full",
      success: true,
      uiPayload: {
        type: "jd_report",
        company: "Example",
        role: "产品经理",
        archetype: "Bearer abcdefghijklmnop",
      },
    });
    expect(JSON.stringify(view)).not.toContain("Bearer abcdefghijklmnop");
  });

  it("fails closed for unknown payload types", () => {
    const view = projectToolResultForUser({
      toolName: "unknown_tool",
      success: true,
      uiPayload: { type: "internal_debug", content: "raw json" },
    });
    expect(view.kind).toBe("silent");
  });

  it("normalizes unsafe reasoning summaries to a fixed label", () => {
    expect(sanitizeSafeReasoningSummary("system prompt: hidden chain-of-thought")).toBe("正在处理");
    expect(sanitizeSafeReasoningSummary("正在校验简历版本 v3")).toBe("正在校验简历版本 v3");
  });

  it("adapts legacy tool messages without copying raw result or data", () => {
    const message: AgentMessage = {
      role: "tool",
      toolName: "search_applications",
      content: "raw result with internal instructions",
      toolResult: { success: true, result: "raw result", data: { secret: "x" } },
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const adapted = adaptLegacyAgentMessage(message);
    expect(adapted?.content).toBe("已查询投递记录");
    expect(JSON.stringify(adapted)).not.toContain("raw result");
    expect(JSON.stringify(adapted)).not.toContain("secret");
  });

  it("preserves failed legacy tool status while hiding raw errors", () => {
    const message: AgentMessage = {
      role: "tool",
      toolName: "search_applications",
      content: "database password leaked",
      toolResult: { status: "failed", result: "database password leaked" },
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const adapted = adaptLegacyAgentMessage(message);
    expect(adapted?.toolResult).toMatchObject({ status: "failed" });
    expect(JSON.stringify(adapted)).not.toContain("database password leaked");
  });

  it("creates new safe objects even when projection keeps the same message count", () => {
    const message: AgentMessage = {
      role: "tool",
      toolName: "search_applications",
      content: "raw result",
      toolResult: { success: true, result: "raw result", data: { secret: "x" } },
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const projected = projectAgentMessages([message]);
    expect(projected).toHaveLength(1);
    expect(projected[0]).not.toBe(message);
    expect(JSON.stringify(projected)).not.toContain("raw result");
  });

  it("drops legacy tool messages that have no safe presentation", () => {
    const message: AgentMessage = {
      role: "tool",
      toolName: "mine_profile",
      content: "internal skill body",
      toolResult: { success: true, result: "internal skill body" },
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    expect(adaptLegacyAgentMessage(message)).toBeNull();
    expect(projectAgentMessages([message])).toEqual([]);
  });

  it("drops legacy empty assistant placeholders", () => {
    const message: AgentMessage = {
      role: "assistant",
      content: "   ",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    expect(projectAgentMessages([message])).toEqual([]);
  });
});
