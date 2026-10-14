import { describe, expect, it, vi } from "vitest";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import type { InterviewRebindResolution } from "@/lib/agent/interview-rebind-policy";

const continuation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/interview-analysis-service", () => ({
  continueDurableInterviewForAgent: continuation,
}));

describe("Worker interview material continuation", () => {
  it("delivers the owner-resolved material to the interview engine without converting it into a new answer", async () => {
    continuation.mockResolvedValue({ message: "补充材料已保存，仍回答当前题。" });
    const resolution: InterviewRebindResolution = {
      action: "use_as_supporting_context", materialKind: "jd", reason: "explicit supporting material",
      match: { confidence: "high", score: 1, matchedBy: ["id"],
        record: { id: 28, kind: "jd", company: "乙公司", role: "前端工程师", title: "乙公司前端 JD", body: "React 项目与可访问性要求" } },
    };
    const events = [];
    for await (const event of agentLoopServer({
      systemPrompt: "interview", messages: [{ role: "user", content: "参考 JD #28，不重开" }],
      taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: "继续本场面试" }),
      interviewRebindAction: resolution.action,
      interviewRebindResolution: resolution,
      executionContext: { principal: { userId: "owner-a" }, runId: "run-a", conversationId: 42, requestId: "turn-material-a", allowlist: [] },
    })) events.push(event);
    expect(continuation).toHaveBeenCalledWith({ userId: "owner-a" }, expect.objectContaining({
      conversationId: 42, content: "参考 JD #28，不重开", requestKey: "turn-material-a", materialResolution: resolution,
    }), expect.anything());
    expect(events.filter((event) => event.type === "tool_call")).toEqual([]);
    expect(events).toContainEqual({ type: "text", content: "补充材料已保存，仍回答当前题。" });
  });
});
