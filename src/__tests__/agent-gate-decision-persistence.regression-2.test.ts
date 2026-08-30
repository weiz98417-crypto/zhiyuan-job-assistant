import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reconcileRunGateMessages } from "@/lib/agent/run-gate-message-status";

describe("Agent Gate decision persistence regression", () => {
  it("projects a denied Gate into the persisted conversation card", () => {
    const messages = [{
      role: "tool",
      content: "等待批准",
      toolResult: {
        uiPayload: {
          type: "run_gate",
          gateId: "gate-denied",
          scopeHash: "scope-denied",
          status: "pending",
        },
      },
    }];

    const reconciled = reconcileRunGateMessages(messages, [{
      gateId: "gate-denied",
      toolName: "save_reference_resume",
      scopeHash: "scope-denied",
      status: "denied",
      resolvedAt: "2026-08-30T20:00:00.000Z",
    }]);

    expect(reconciled[0]?.toolResult).toEqual(expect.objectContaining({
      uiPayload: expect.objectContaining({ status: "denied" }),
    }));
  });

  it("writes the reconciled Gate card back to the current Session", () => {
    const pageSource = readFileSync(join(process.cwd(), "src/app/agent/page.tsx"), "utf8");

    expect(pageSource).toContain("reconcileRunGateMessages(messages");
    expect(pageSource).toContain("await updateSession(currentSessionId, { messages: nextMessages })");
  });
});
