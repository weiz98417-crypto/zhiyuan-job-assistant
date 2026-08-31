import { describe, expect, it } from "vitest";
import { admitAgentRun } from "@/lib/agent/run-admission";

describe("Agent Run Admission", () => {
  it("keeps career positioning as the primary goal when profile writes are forbidden", () => {
    const decision = admitAgentRun({
      conversationId: 12,
      input: { content: "帮我定位职业方向，但不要写入求职画像" },
      entryHints: { agentId: "profile", taskType: "profile_update", source: "agent_chat" },
    });

    expect(decision.kind).toBe("start_new_run");
    expect(decision.taskType).toBe("career_positioning_guidance");
    expect(decision.agentId).toBe("profile");
    expect(decision.contract?.routing?.contractPolicy).toBe("guidance");
    expect(decision.evidence).toContain("client.taskType_ignored");
  });

  it("routes a write-forbidden resume proposal to the gated resume-edit goal", () => {
    const decision = admitAgentRun({
      conversationId: 12,
      input: { content: "请生成简历修改提案，但不要直接写入我的简历" },
      entryHints: { agentId: "general", taskType: "general_chat" },
    });

    expect(decision.kind).toBe("start_new_run");
    expect(decision.taskType).toBe("resume_edit");
    expect(decision.agentId).toBe("resume");
    expect(decision.contract?.requiresUserApproval).toBe(true);
    expect(decision.contract?.routing?.allowedTools).toContain("create_resume_edit_proposal");
  });
});
