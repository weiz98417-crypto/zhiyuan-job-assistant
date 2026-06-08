import { describe, expect, it } from "vitest";
import { enforceToolPolicy, isToolAllowedInMode } from "@/lib/agent/loop/tool-policy";
import { buildAgentContextState, formatAgentContextState } from "@/lib/agent/memory/coordinator";
import { evaluateAgent } from "@/lib/agent/registry/agents/evaluate-agent";
import { interviewAgent } from "@/lib/agent/registry/agents/interview-agent";
import { getReportDetail } from "@/lib/agent/tools/query/get-report-detail";
import type { InterviewSessionState } from "@/types";

function activeInterviewState(): InterviewSessionState {
  return {
    status: "active",
    planSnapshot: {
      snapshotId: "plan_1",
      source: { jdId: 10, resumeId: "resume_1" },
      jdSnapshot: {
        company: "Acme",
        role: "AI Product Manager",
        body: "JD snapshot body: build AI product workflows and data products.",
      },
      resumeSnapshot: {
        title: "Main resume",
        body: "Resume snapshot body: AI hardware, computer vision, and product projects.",
      },
      mode: "realistic",
      difficulty: "normal",
      focusAreas: ["jd-match"],
      allowFollowUps: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    currentQuestionId: "q1",
    questionGraph: [
      {
        id: "q1",
        kind: "main",
        question: "Tell me about one relevant project.",
        answerTurnIds: ["turn_user_1"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    transcript: [
      {
        id: "turn_user_1",
        role: "user",
        content: "I led an AI product prototype.",
        questionNodeId: "q1",
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ],
    scoreArtifacts: [],
    rebindHistory: [],
  };
}

function unansweredInterviewState(): InterviewSessionState {
  const state = activeInterviewState();
  return {
    ...state,
    questionGraph: state.questionGraph.map((node) => ({ ...node, answerTurnIds: [] })),
    transcript: [],
  };
}

describe("agent tool policy", () => {
  it("blocks evaluate agent web search unless explicitly requested", () => {
    const result = enforceToolPolicy({
      toolName: "web_search",
      params: { query: "字节 Seed 薪资" },
      messages: [{ role: "user", content: "根据我的简历重新评估这个JD" }],
      toolWhitelist: evaluateAgent.toolNames,
    });
    expect(result?.success).toBe(false);
    expect(result?.llmSummary).toContain("不要联网搜索");
  });

  it("blocks interview agent web search for JD preparation advice", () => {
    const result = enforceToolPolicy({
      toolName: "web_search",
      params: { query: "字节跳动 面经" },
      messages: [{ role: "user", content: "这个JD需要考察代码吗？我重点应该准备什么" }],
      toolWhitelist: interviewAgent.toolNames,
    });
    expect(result?.success).toBe(false);
  });

  it("allows interview web search when user explicitly asks for 面经", () => {
    const result = enforceToolPolicy({
      toolName: "web_search",
      params: { query: "字节跳动 AI数据运营 面经" },
      messages: [{ role: "user", content: "帮我搜一下字节这个岗位的面经" }],
      toolWhitelist: [...interviewAgent.toolNames, "web_search"],
    });
    expect(result).toBeNull();
  });

  it("blocks fetch_jd_content when user did not provide a fresh URL", () => {
    const result = enforceToolPolicy({
      toolName: "fetch_jd_content",
      params: { url: "https://stale.example/jobs/1" },
      messages: [{ role: "user", content: "现在根据我的简历对这个JD做完整评估" }],
      toolWhitelist: evaluateAgent.toolNames,
    });
    expect(result?.error).toContain("没有提供新的 JD 链接");
  });
  it("blocks full interview prep tools when an active interview session already exists", () => {
    const result = enforceToolPolicy({
      toolName: "prepare_interview_full",
      params: { company: "Acme", role: "AI Product Manager" },
      messages: [{ role: "user", content: "give me a complete interview prep plan" }],
      toolWhitelist: interviewAgent.toolNames,
      interviewState: activeInterviewState(),
    });

    expect(result?.success).toBe(false);
    expect(result?.errorCategory).toBe("need_user_input");
    expect(result?.llmSummary).toContain("Active interview session");
  });

  it("allows explicit interview restart wording to pass through full prep tools", () => {
    const result = enforceToolPolicy({
      toolName: "start_interview_session",
      params: { company: "Acme", role: "AI Product Manager" },
      messages: [{ role: "user", content: "restart this mock interview from scratch" }],
      toolWhitelist: interviewAgent.toolNames,
      interviewState: activeInterviewState(),
    });

    expect(result).toBeNull();
  });

  it("blocks material restart tools unless rebind arbitration approves restart", () => {
    const blocked = enforceToolPolicy({
      toolName: "start_interview_session",
      params: { company: "ByteDance", role: "AI Product Manager" },
      messages: [{ role: "user", content: "换成字节 AI 产品经理 JD 并重新开始一场模拟面试" }],
      toolWhitelist: interviewAgent.toolNames,
      interviewState: activeInterviewState(),
      interviewRebindAction: "ask_clarification",
    });
    expect(blocked?.success).toBe(false);
    expect(blocked?.llmSummary).toContain("rebind arbitration");

    const allowed = enforceToolPolicy({
      toolName: "start_interview_session",
      params: { company: "ByteDance", role: "AI Product Manager" },
      messages: [{ role: "user", content: "换成字节 AI 产品经理 JD 并重新开始一场模拟面试" }],
      toolWhitelist: interviewAgent.toolNames,
      interviewState: activeInterviewState(),
      interviewRebindAction: "auto_restart_interview",
    });
    expect(allowed).toBeNull();
  });

  it("hydrates active interview question generation from the stored snapshot and forces one question", () => {
    const params: Record<string, unknown> = { count: 8 };
    const result = enforceToolPolicy({
      toolName: "generate_interview_questions",
      params,
      messages: [{ role: "user", content: "ask the next question" }],
      toolWhitelist: interviewAgent.toolNames,
      interviewState: activeInterviewState(),
    });

    expect(result).toBeNull();
    expect(params.count).toBe(1);
    expect(params.company).toBe("Acme");
    expect(params.role).toBe("AI Product Manager");
    expect(params.jdText).toContain("JD snapshot body");
    expect(params.cvText).toContain("Resume snapshot body");
  });

  it("blocks resume reloads when the user only asks to continue an active interview", () => {
    const result = enforceToolPolicy({
      toolName: "read_file",
      params: { path: "我的简历" },
      messages: [{ role: "user", content: "下一题呗" }],
      toolWhitelist: interviewAgent.toolNames,
      interviewState: activeInterviewState(),
    });

    expect(result?.success).toBe(false);
    expect(result?.llmSummary).toContain("Active Interview Session");
    expect(result?.llmSummary).toContain("generate_interview_questions");
  });

  it("hydrates interview scoring from stored question and answer turns", () => {
    const params: Record<string, unknown> = {};
    const result = enforceToolPolicy({
      toolName: "score_interview_answer",
      params,
      messages: [{ role: "user", content: "score my last answer" }],
      toolWhitelist: interviewAgent.toolNames,
      interviewState: activeInterviewState(),
    });

    expect(result).toBeNull();
    expect(params.question).toBe("Tell me about one relevant project.");
    expect(params.answer).toBe("I led an AI product prototype.");
    expect(params.context).toContain("JD snapshot body");
    expect(params.context).toContain("Resume snapshot body");
  });

  it("blocks interview scoring without asking for pasted answers when no stored answer exists", () => {
    const result = enforceToolPolicy({
      toolName: "score_interview_answer",
      params: {},
      messages: [{ role: "user", content: "score my answer" }],
      toolWhitelist: interviewAgent.toolNames,
      interviewState: unansweredInterviewState(),
    });

    expect(result?.success).toBe(false);
    expect(result?.errorCategory).toBe("need_user_input");
    expect(result?.llmSummary).toContain("Do not ask the user to paste previous answers");
  });
});

describe("AgentContextState", () => {
  it("extracts recent JD, report number, resume mention, and supplemental company fact", () => {
    const state = buildAgentContextState([
      { role: "user", content: "JD：负责搭建 Agent 完成数据生产任务，要求 Python、Prompt Engineering、数据标注策略、模型调优，字节 Seed AI数据运营实习生。" },
      { role: "assistant", content: "报告编号: 5" },
      { role: "user", content: "公司是字节，而且我有简历啊" },
    ]);
    expect(state.latestJD?.bodyPreview).toContain("搭建 Agent");
    expect(state.latestReport?.reportNum).toBe(5);
    expect(state.targetCompany).toBe("字节跳动");
    expect(state.resumeMentioned).toBe(true);
    expect(formatAgentContextState(state)).toContain("用户后续补充");
  });
});

describe("agent tool whitelists", () => {
  it("evaluate agent can read resume and recent JD", () => {
    expect(evaluateAgent.toolNames).toContain("read_file");
    expect(evaluateAgent.toolNames).toContain("get_recent_jd_context");
    expect(evaluateAgent.toolNames).not.toContain("web_search");
  });

  it("global context tools remain executable even when a stale mode whitelist is narrower", () => {
    expect(isToolAllowedInMode("read_file", ["evaluate_jd_full"])).toBe(true);
    expect(isToolAllowedInMode("get_profile", ["evaluate_jd_full"])).toBe(true);
    expect(isToolAllowedInMode("get_reference_detail", ["generate_interview_questions"])).toBe(true);
    expect(isToolAllowedInMode("get_recent_jd_context", ["generate_interview_questions"])).toBe(true);
    expect(isToolAllowedInMode("web_search", ["evaluate_jd_full"])).toBe(false);
  });

  it("interview agent reads local JD context and does not expose web_search by default", () => {
    expect(interviewAgent.toolNames).toContain("get_recent_jd_context");
    expect(interviewAgent.toolNames).not.toContain("web_search");
  });

  it("get_report_detail keeps full report out of LLM context", () => {
    expect(getReportDetail.toolCtxCap).toBeLessThanOrEqual(1200);
  });
});
