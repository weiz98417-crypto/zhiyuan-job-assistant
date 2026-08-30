import { describe, expect, it } from "vitest";
import { AgentItemAssembler } from "@/lib/agent/item-projection";

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
});
