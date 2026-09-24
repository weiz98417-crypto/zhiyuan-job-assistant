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

  it("admits screenshot diagnosis without requiring a JD or saved resume", () => {
    const decision = admitAgentRun({
      conversationId: 12,
      input: { content: "评估这份简历", images: ["data:image/png;base64,abc"] },
      entryHints: { agentId: "resume", source: "agent_chat" },
    });

    expect(decision.kind).toBe("start_new_run");
    expect(decision.taskType).toBe("resume_diagnosis");
    expect(decision.contract?.requiresUserApproval).toBe(false);
    expect(decision.contract?.routing?.allowedTools).not.toContain("read_file");
    expect(decision.contract?.routing?.allowedTools).not.toContain("apply_resume_edit_proposal");
  });

  it("continues the same diagnosis run when pasted resume text follows an unreadable screenshot", () => {
    const decision = admitAgentRun({
      conversationId: 12,
      input: { content: "工作经历：负责 AI 产品规划与上线；项目经历：搭建 RAG 知识库。" },
      entryHints: { agentId: "resume", source: "agent_chat" },
      activeRun: { id: "resume-diagnosis-run", taskType: "resume_diagnosis", status: "waiting_user" },
    });

    expect(decision.kind).toBe("continue_current_run");
    expect(decision.currentRunId).toBe("resume-diagnosis-run");
    expect(decision.route?.requiresClarification).toBe(false);
  });
});
