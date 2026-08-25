import { describe, expect, it } from "vitest";
import { buildRunContext } from "@/lib/agent/runtime/run-context";
import { compactExecutionConversation } from "@/lib/agent/runtime/execution-session-service";

describe("Run Context builder", () => {
  it("excludes interrupted model output while preserving durable fact references", () => {
    const context = buildRunContext({
      contract: { target: "优化项目经历", constraints: ["不虚构"] },
      checkpoint: {
        messages: [{ role: "user", content: "优化我的项目经历" }],
        plan: { cursor: 1 },
        factRefs: [{ type: "resume", id: "resume-1", version: "v3", hash: "hash-v3" }],
      },
      pendingInputs: [{ role: "user", content: "重点写 AI 项目" }],
      completedToolFacts: [{ toolName: "read_file", summary: "已读取简历 v3" }],
      recoveryObservations: [],
      evidence: [{ type: "model.output_interrupted", content: "半截回答不应该恢复" }],
      gates: [],
    });

    expect(context.messages.map((message) => message.content).join("\n")).not.toContain("半截回答");
    expect(context.factRefs).toEqual([
      { type: "resume", id: "resume-1", version: "v3", hash: "hash-v3" },
    ]);
  });

  it("compacts oversized model context while preserving recent turns", () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `${index}:${"上下文".repeat(700)}`,
    }));

    const result = compactExecutionConversation(messages, 6_000);

    expect(result.compacted).toBe(true);
    expect(result.omittedCount).toBeGreaterThan(0);
    expect(result.messages[0].content).toContain("CONTEXT_COMPACTION");
    expect(result.messages.at(-1)?.content).toContain("11:");
    expect(result.messages.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(6_100);
  });
});
