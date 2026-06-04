import { describe, expect, it } from "vitest";
import type { AgentMessage, InterviewQuestionNode, JDRecord } from "@/types";
import {
  buildInterviewPlanSnapshot,
  createInterviewState,
  persistInterviewRecap,
  recordInterviewRebind,
  shouldPersistInterviewRecap,
  updateInterviewStateWithAssistantMessage,
  updateInterviewStateWithExchange,
  updateInterviewStateWithToolResult,
} from "@/lib/agent/interview-session-state";

const jd: JDRecord = {
  id: 12,
  company: "Acme",
  role: "AI Product Manager",
  sourceType: "paste",
  body: "Own AI product roadmap and evaluate model quality.",
  keywords: ["AI", "product"],
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

function msg(role: AgentMessage["role"], content: string, extra: Partial<AgentMessage> = {}): AgentMessage {
  return {
    role,
    content,
    timestamp: "2026-06-04T09:00:00.000Z",
    ...extra,
  };
}

function interviewState() {
  return createInterviewState(buildInterviewPlanSnapshot({
    jd,
    resumeText: "Built AI evaluation workflows.",
    resumeTitle: "Main resume",
  }));
}

describe("Interview session state", () => {
  it("freezes JD and resume content in the active session snapshot", () => {
    const mutableJd: JDRecord = {
      ...jd,
      company: "Original Co",
      role: "Original Role",
      body: "Original JD requirements.",
    };
    const originalResume = "Original resume case study.";
    const snapshot = buildInterviewPlanSnapshot({
      jd: mutableJd,
      resumeText: originalResume,
      resumeTitle: "Resume v1",
    });
    const state = createInterviewState(snapshot);

    mutableJd.company = "Edited Co";
    mutableJd.role = "Edited Role";
    mutableJd.body = "Edited JD requirements.";
    const editedResume = "Edited resume case study.";

    expect(state.planSnapshot.source.jdId).toBe(12);
    expect(state.planSnapshot.source.resumeId).toBe("Resume v1");
    expect(state.planSnapshot.jdSnapshot).toMatchObject({
      company: "Original Co",
      role: "Original Role",
      body: "Original JD requirements.",
    });
    expect(state.planSnapshot.resumeSnapshot).toMatchObject({
      title: "Resume v1",
      body: originalResume,
    });
    expect(state.planSnapshot.resumeSnapshot?.body).not.toBe(editedResume);
  });

  it("keeps the active AgentChat snapshot when prep configuration changes later", () => {
    const activeSnapshot = buildInterviewPlanSnapshot({
      jd: {
        ...jd,
        company: "Active Co",
        role: "Active PM",
        body: "Active JD snapshot.",
      },
      resumeText: "Active resume snapshot.",
      resumeTitle: "Active resume",
      focusAreas: ["AI 产品"],
    });
    const activeState = createInterviewState(activeSnapshot);
    const laterPrepSnapshot = buildInterviewPlanSnapshot({
      jd: {
        ...jd,
        id: 99,
        company: "Later Co",
        role: "Later PM",
        body: "Later prep JD.",
      },
      resumeText: "Later prep resume.",
      resumeTitle: "Later resume",
      focusAreas: ["数据产品"],
    });

    const progressed = updateInterviewStateWithAssistantMessage(
      activeState,
      msg("assistant", "第一题：请介绍一个最贴近 Active JD 的项目？"),
    );

    expect(progressed?.planSnapshot.snapshotId).toBe(activeSnapshot.snapshotId);
    expect(progressed?.planSnapshot.jdSnapshot?.company).toBe("Active Co");
    expect(progressed?.planSnapshot.jdSnapshot?.body).toBe("Active JD snapshot.");
    expect(progressed?.planSnapshot.resumeSnapshot?.body).toBe("Active resume snapshot.");
    expect(progressed?.planSnapshot.focusAreas).toEqual(["AI 产品"]);
    expect(progressed?.planSnapshot.snapshotId).not.toBe(laterPrepSnapshot.snapshotId);
    expect(progressed?.planSnapshot.jdSnapshot?.body).not.toBe(laterPrepSnapshot.jdSnapshot?.body);
    expect(progressed?.planSnapshot.resumeSnapshot?.body).not.toBe(laterPrepSnapshot.resumeSnapshot?.body);
  });

  it("stores hidden bootstrap assistant questions as the active main question", () => {
    const state = interviewState();
    const next = updateInterviewStateWithAssistantMessage(
      state,
      msg("assistant", "第一题：请结合你的简历介绍一个最贴近这个 JD 的 AI 产品项目？"),
    );

    expect(next?.questionGraph).toHaveLength(1);
    expect(next?.questionGraph[0].kind).toBe("main");
    expect(next?.currentQuestionId).toBe(next?.questionGraph[0].id);
    expect(next?.transcript[0].questionNodeId).toBe(next?.questionGraph[0].id);
  });

  it("stores follow-ups as children of the current answered question", () => {
    const started = updateInterviewStateWithAssistantMessage(
      interviewState(),
      msg("assistant", "第一题：请介绍一个 AI 产品项目？"),
    );
    const parentId = started?.currentQuestionId;

    const next = updateInterviewStateWithExchange(
      started,
      msg("user", "我做过一个模型评估平台，负责指标和验收。"),
      msg("assistant", "追问：你刚才提到指标，能否具体展开你如何定义质量阈值？"),
    );

    const followUp = next?.questionGraph.at(-1);
    const parent = next?.questionGraph.find((node) => node.id === parentId);
    expect(followUp?.kind).toBe("follow_up");
    expect(followUp?.parentId).toBe(parentId);
    expect(parent?.answerTurnIds).toHaveLength(1);
  });

  it("stores a follow-up after Q3 as a child of Q3 instead of the last planned question", () => {
    const questions: InterviewQuestionNode[] = Array.from({ length: 9 }, (_, index) => ({
      id: `q${index + 1}`,
      kind: "main",
      question: `第 ${index + 1} 题：主问题 ${index + 1}？`,
      answerTurnIds: [],
      createdAt: "2026-06-04T09:00:00.000Z",
    }));
    const state = {
      ...interviewState(),
      currentQuestionId: "q3",
      questionGraph: questions,
    };

    const next = updateInterviewStateWithExchange(
      state,
      msg("user", "我回答第三题，重点讲了需求拆解和上线结果。"),
      msg("assistant", "追问：你刚才提到需求拆解，能否展开讲一个冲突处理细节？"),
    );

    const followUp = next?.questionGraph.at(-1);
    const q3 = next?.questionGraph.find((node) => node.id === "q3");
    const q9 = next?.questionGraph.find((node) => node.id === "q9");
    expect(followUp?.kind).toBe("follow_up");
    expect(followUp?.parentId).toBe("q3");
    expect(q3?.answerTurnIds).toHaveLength(1);
    expect(q9?.answerTurnIds).toHaveLength(0);
  });

  it("persists score artifacts separately from raw tool text", () => {
    const started = updateInterviewStateWithAssistantMessage(
      interviewState(),
      msg("assistant", "第一题：请介绍一个 AI 产品项目？"),
    );
    const answered = updateInterviewStateWithExchange(
      started,
      msg("user", "我负责从需求到指标再到上线验收。"),
      msg("assistant", "好的，我先记录你的回答。"),
    );
    const scored = updateInterviewStateWithToolResult(
      answered,
      msg("tool", "raw score text", {
        toolName: "score_interview_answer",
        toolResult: {
          data: {
            overall: 4.2,
            dimensions: { structure: 4, specificity: 4.5 },
            suggestions: ["补充业务结果数据"],
          },
        },
      }),
    );

    expect(scored?.scoreArtifacts).toHaveLength(1);
    expect(scored?.scoreArtifacts?.[0].score.overall).toBe(4.2);
    expect(scored?.questionGraph[0].score?.overall).toBe(4.2);
    expect(scored?.scoreArtifacts?.[0].score.feedback).toContain("业务结果");
  });

  it("persists recap from stored turns and scores", () => {
    const started = updateInterviewStateWithAssistantMessage(
      interviewState(),
      msg("assistant", "第一题：请介绍一个 AI 产品项目？"),
    );
    const answered = updateInterviewStateWithExchange(
      started,
      msg("user", "我负责搭建指标体系并推动上线。"),
      msg("assistant", "好的，我先记录你的回答。"),
    );
    const scored = updateInterviewStateWithToolResult(
      answered,
      msg("tool", "score", {
        toolName: "score_interview_answer",
        toolResult: { data: { overall: 4, feedback: "结构清楚，但结果数据不足。" } },
      }),
    );

    expect(shouldPersistInterviewRecap("请帮我做一次复盘")).toBe(true);
    const recapped = persistInterviewRecap(scored, "本轮整体不错，但要加强量化结果。");

    expect(recapped?.recap?.rawText).toContain("整体不错");
    expect(recapped?.recap?.sourceTurnIds?.length).toBe(scored?.transcript.length);
    expect(recapped?.recap?.questionFeedback?.[0].score).toBe(4);
    expect(recapped?.recap?.questionFeedback?.[0].answerExcerpt).toContain("指标体系");
    expect(recapped?.recap?.questionFeedback?.[0].sourceTurnIds).toHaveLength(1);
    expect(recapped?.recap?.weaknesses.length).toBeGreaterThanOrEqual(0);
    expect(recapped?.recap?.weakSpots?.length).toBeGreaterThan(0);
    expect(recapped?.recap?.evidenceFromAnswers?.[0]).toContain("指标体系");
    expect(recapped?.recap?.followUpPerformance?.[0]).toContain("追问");
    expect(recapped?.recap?.nextPracticePlan.length).toBeGreaterThan(0);
    expect(recapped?.recap?.overallVerdict).toContain("平均评分 4/5");
    expect(recapped?.recap?.overallVerdict).not.toContain("整体不错");
  });

  it("builds recap from multiple stored answers without asking the user to repost them", () => {
    const q1 = updateInterviewStateWithAssistantMessage(
      interviewState(),
      msg("assistant", "第一题：请介绍一个 AI 产品项目？"),
    );
    const q2Asked = updateInterviewStateWithExchange(
      q1,
      msg("user", "第一题回答：我负责模型评估指标和上线验收。"),
      msg("assistant", "第二题：请讲一次你和研发对齐需求优先级的经历？"),
    );
    const q2Answered = updateInterviewStateWithExchange(
      q2Asked,
      msg("user", "第二题回答：我组织评审会拆优先级，并用数据说明取舍。"),
      msg("assistant", "好的，我记录完这两道题。"),
    );

    const recapped = persistInterviewRecap(q2Answered, "请用户重新粘贴前面所有答案。");
    const feedback = recapped?.recap?.questionFeedback || [];
    const structuredRecapText = [
      recapped?.recap?.overallVerdict,
      ...(recapped?.recap?.strengths || []),
      ...(recapped?.recap?.weakSpots || []),
      ...(recapped?.recap?.evidenceFromAnswers || []),
      ...(recapped?.recap?.nextPracticePlan || []),
      ...feedback.map((item) => `${item.question}\n${item.answerExcerpt || ""}\n${item.feedback || ""}`),
    ].join("\n");

    expect(feedback).toHaveLength(2);
    expect(feedback[0].answerExcerpt).toContain("模型评估指标");
    expect(feedback[1].answerExcerpt).toContain("评审会拆优先级");
    expect(feedback[0].sourceTurnIds).toHaveLength(1);
    expect(feedback[1].sourceTurnIds).toHaveLength(1);
    expect(recapped?.recap?.overallVerdict).toContain("2 道已回答问题");
    expect(structuredRecapText).not.toContain("重新粘贴");
  });

  it("records confirmed rebinds in session history", () => {
    const state = interviewState();
    const rebound = recordInterviewRebind(state, {
      to: { jdId: 99, resumeId: "v2" },
      reason: "User explicitly switched to a matched JD and resume.",
      createdAt: "2026-06-04T10:00:00.000Z",
    });

    expect(rebound?.rebindHistory).toHaveLength(1);
    expect(rebound?.rebindHistory[0].from).toMatchObject({ jdId: 12, resumeId: "Main resume" });
    expect(rebound?.rebindHistory[0].to).toMatchObject({ jdId: 99, resumeId: "v2" });
    expect(rebound?.rebindHistory[0].reason).toContain("explicitly switched");
  });

  it("records explicit resume restart rebinds in session history", () => {
    const state = interviewState();
    const rebound = recordInterviewRebind(state, {
      to: { resumeId: "23" },
      reason: "User explicitly switched to resume #23 and restarted the interview.",
      createdAt: "2026-06-04T10:05:00.000Z",
    });

    expect(rebound?.rebindHistory).toHaveLength(1);
    expect(rebound?.rebindHistory[0].from).toMatchObject({ jdId: 12, resumeId: "Main resume" });
    expect(rebound?.rebindHistory[0].to).toMatchObject({ resumeId: "23" });
    expect(rebound?.rebindHistory[0].reason).toContain("restarted");
  });
});
