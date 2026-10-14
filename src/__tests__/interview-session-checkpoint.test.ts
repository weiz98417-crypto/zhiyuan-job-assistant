import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const boundaries = vi.hoisted(() => ({
  assembleAgentMemoryContext: vi.fn(),
  llmRetry: vi.fn(),
  recordWeaknessEvent: vi.fn(),
  jds: { get: vi.fn() },
  referenceResumes: { get: vi.fn() },
  resumeDocuments: { list: vi.fn(), get: vi.fn(), getActive: vi.fn() },
  sessions: {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/agent/memory-context", () => ({
  assembleAgentMemoryContext: boundaries.assembleAgentMemoryContext,
}));
vi.mock("@/lib/llm-retry", () => ({ llmRetry: boundaries.llmRetry }));
vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({ sessions: boundaries.sessions, jds: boundaries.jds, referenceResumes: boundaries.referenceResumes, resumeDocuments: boundaries.resumeDocuments }),
}));
vi.mock("@/lib/server/interview-trend", () => ({
  recordWeaknessEvent: boundaries.recordWeaknessEvent,
  sessionSurrogateFor: (sessionId: string) => `sess:${sessionId}`,
}));

import { handleInterviewSessionTurnForAgent, startInterviewSessionForAgent, setInterviewServiceOverridesForTests } from "@/lib/server/interview-analysis-service";
import { buildInterviewPlanSnapshot, createInterviewState, projectDurableInterviewEngineState } from "@/lib/agent/interview-session-state";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import { createAgentTaskContract } from "@/lib/agent/task-contract";

describe("durable interview session checkpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInterviewServiceOverridesForTests({ rubricCompletion: undefined, followUpCompletion: undefined, questionBankStore: undefined, bankCompletion: undefined });
    boundaries.jds.get.mockResolvedValue(undefined);
    boundaries.referenceResumes.get.mockResolvedValue(undefined);
    boundaries.resumeDocuments.list.mockResolvedValue([]);
    boundaries.resumeDocuments.get.mockResolvedValue(undefined);
    boundaries.resumeDocuments.getActive.mockResolvedValue(undefined);
    let storedRow: Record<string, unknown> | undefined;
    boundaries.assembleAgentMemoryContext.mockResolvedValue({ llmSummary: "候选人的长期记忆" });
    boundaries.llmRetry.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        questions: [{ category: "technical", question: "请介绍最相关的 Agent 项目。", source: "jd" }],
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    boundaries.sessions.list.mockResolvedValue([]);
    boundaries.sessions.create.mockImplementation(async (input: Record<string, unknown>) => {
      storedRow = {
        id: 42,
        title: input.title,
        messages_json: input.messages,
        interview_state_json: input.interviewState,
        agent_state_json: input.agentState,
      };
      return 42;
    });
    boundaries.sessions.get.mockImplementation(async () => storedRow);
    boundaries.sessions.update.mockImplementation(async (_id: number, _userId: string, updates: Record<string, unknown>) => {
      if (!storedRow) return false;
      const currentState = storedRow.interview_state_json as Record<string, unknown>;
      if (updates.expectedInterviewCheckpointVersion !== undefined && Number(currentState.checkpointVersion || 0) !== updates.expectedInterviewCheckpointVersion) return false;
      storedRow = {
        ...storedRow,
        messages_json: updates.messages ?? storedRow.messages_json,
        interview_state_json: updates.interviewState ?? storedRow.interview_state_json,
        agent_state_json: updates.agentState ?? storedRow.agent_state_json,
      };
      return true;
    });
  });

  it("read-back verifies every turn and recovers a repeated request", async () => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, {
      company: "甲公司",
      role: "AI 产品经理",
    });
    const followedUp = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: started.sessionId,
      answer: "我负责过 Agent 项目。",
    });
    const recovered = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: started.sessionId,
      answer: "我负责过 Agent 项目。",
    });

    expect(started).toMatchObject({ sessionId: "42", readBackVerified: true });
    expect(followedUp).toMatchObject({ action: "followup", readBackVerified: true });
    expect(recovered).toMatchObject({ action: "followup", readBackVerified: true, recovered: true });
    expect(boundaries.sessions.update).toHaveBeenCalledTimes(1);
  });

  it("pauses across reload and resumes the same question without recording controls as answers", async () => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, {
      company: "甲公司", role: "AI 产品经理", jdText: "负责 SQL 数据产品", cvText: "周报从 5 小时缩短到 2 小时",
    });
    const generationCalls = boundaries.llmRetry.mock.calls.length;
    const paused = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: started.sessionId, answer: "暂停面试", requestKey: "pause-1",
    });
    const pausedRow = await boundaries.sessions.get(42, principal.userId);
    const pausedState = projectDurableInterviewEngineState(JSON.stringify(pausedRow.interview_state_json));
    expect(paused).toMatchObject({ action: "paused", question: started.question, readBackVerified: true });
    expect(pausedState?.status).toBe("paused");
    expect(pausedState?.questionGraph).toHaveLength(1);
    expect(pausedState?.questionGraph[0].answerTurnIds).toHaveLength(0);
    expect(pausedState?.planSnapshot.jdSnapshot?.body).toBe("负责 SQL 数据产品");

    const resumed = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: started.sessionId, answer: "继续面试", requestKey: "resume-1",
    });
    const resumedRow = await boundaries.sessions.get(42, principal.userId);
    const resumedState = projectDurableInterviewEngineState(resumedRow.interview_state_json);
    expect(resumed).toMatchObject({ action: "resumed", question: started.question });
    expect(resumedState?.status).toBe("active");
    expect(resumedState?.currentQuestionId).toBe(pausedState?.currentQuestionId);
    expect(resumedState?.questionGraph[0].answerTurnIds).toHaveLength(0);
    expect(boundaries.llmRetry).toHaveBeenCalledTimes(generationCalls);
  });

  it("skips a question without scoring the instruction or creating an answered round", async () => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    const skipped = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "下一题", requestKey: "skip-1" });
    const row = await boundaries.sessions.get(42, principal.userId);
    const projected = projectDurableInterviewEngineState(row.interview_state_json);
    expect(skipped).toMatchObject({ action: "next", phase: "tech", questionIndex: 0, previousScore: null });
    expect(projected?.questionGraph).toHaveLength(2);
    expect(projected?.questionGraph.every((question) => question.answerTurnIds.length === 0)).toBe(true);
    expect(projected?.scoreArtifacts).toHaveLength(0);
    expect(row.interview_state_json.answers).toHaveLength(0);
  });

  it("starts the Agent tool through the durable engine and can accept its next answer", async () => {
    const principal = { userId: "user-1" };
    const started = await startInterviewSessionForAgent(principal, { company: "甲公司", role: "AI 产品经理", requestKey: "start-1" });
    const followedUp = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "我负责过 Agent 项目。" });
    const row = await boundaries.sessions.get(42, principal.userId);
    expect(followedUp).toMatchObject({ action: "followup", sessionId: started.sessionId, readBackVerified: true });
    expect(row.interview_state_json.currentQuestion.text).toBe(started.question);
    expect(projectDurableInterviewEngineState(row.interview_state_json)?.questionGraph[0].answerTurnIds).toHaveLength(1);
  });

  it("binds each follow-up answer to its own prompt and scores every recorded answer together", async () => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "我负责周报自动化", requestKey: "a1" });
    await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "我编写 SQL", requestKey: "a2" });
    await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "从 5 小时降至 2 小时", requestKey: "a3" });
    const row = await boundaries.sessions.get(42, principal.userId);
    const answer = row.interview_state_json.answers[0];
    expect(answer.primaryAnswer).toBe("我负责周报自动化");
    expect(answer.followups.map((followup: { answer: string }) => followup.answer)).toEqual(["我编写 SQL", "从 5 小时降至 2 小时"]);
    expect(answer.answer).toContain("我编写 SQL");
    expect(answer.answer).toContain("从 5 小时降至 2 小时");
    const projection = projectDurableInterviewEngineState(row.interview_state_json);
    expect(projection?.transcript.filter((turn) => turn.role === "user").map((turn) => turn.content)).toEqual([
      "我负责周报自动化", "我编写 SQL", "从 5 小时降至 2 小时",
    ]);
    expect(projection?.questionGraph.filter((question) => question.kind === "follow_up").every((question) => question.parentId === answer.questionId)).toBe(true);
    expect(projectDurableInterviewEngineState(row.interview_state_json)).toEqual(projection);
  });

  it.each([
    { command: "结束面试", action: "done", status: "completed" },
    { command: "取消面试", action: "cancelled", status: "abandoned" },
  ])("$command preserves recorded answers without scoring a control or creating another question", async ({ command, action, status }) => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "我负责周报自动化", requestKey: "a1" });
    const ended = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: command, requestKey: "end-1" });
    const row = await boundaries.sessions.get(42, principal.userId);
    const projection = projectDurableInterviewEngineState(row.interview_state_json);
    expect(ended).toMatchObject({ action, phase: "done", status });
    expect(projection?.status).toBe(status);
    expect(row.interview_state_json.answers).toHaveLength(1);
    expect(projection?.transcript.filter((turn) => turn.role === "user").map((turn) => turn.content)).toEqual(["我负责周报自动化"]);
    expect(projection?.recap !== undefined).toBe(status === "completed");
    await expect(handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "新的回答" })).rejects.toThrow("已经结束");
  });

  it("the Worker consumes a pause through the persisted interview engine and returns the actual control result", async () => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    const events = [];
    for await (const event of agentLoopServer({
      systemPrompt: "继续面试",
      messages: [{ role: "user", content: "暂停面试" }],
      taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: "暂停当前面试" }),
      executionContext: { principal, conversationId: 42, runId: "run-42", requestId: "pause-worker-1", allowlist: [] },
    })) events.push(event);
    const row = await boundaries.sessions.get(42, principal.userId);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text", content: expect.stringContaining("面试已暂停") }),
      expect.objectContaining({ type: "interview_state_updated", action: "paused", checkpointVersion: 2, conversationId: 42, readBackVerified: true }),
    ]));
    expect(row.interview_state_json.status).toBe("paused");
    expect(projectDurableInterviewEngineState(row.interview_state_json)?.questionGraph[0].answerTurnIds).toHaveLength(0);
  });

  it("bootstraps a prepared conversation in place with its exact frozen configuration", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    const snapshot = buildInterviewPlanSnapshot({
      resumeText: "我负责 SQL 周报", resumeTitle: "简历 v2", difficulty: "pressure",
      mode: "project-review", focusAreas: ["数据产品"], allowFollowUps: false,
    });
    const row = await boundaries.sessions.get(42, principal.userId);
    row.messages_json = [];
    row.interview_state_json = createInterviewState(snapshot);
    row.agent_state_json = {};
    const events = [];
    for await (const event of agentLoopServer({
      systemPrompt: "模拟面试", messages: [{ role: "user", content: "开始模拟面试" }],
      taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: "开始本场面试" }),
      executionContext: { principal, conversationId: 42, runId: "run-start", requestId: "bootstrap-1", allowlist: [] },
    })) events.push(event);
    const startedRow = await boundaries.sessions.get(42, principal.userId);
    const state = projectDurableInterviewEngineState(startedRow.interview_state_json);
    expect(boundaries.sessions.create).toHaveBeenCalledTimes(1);
    expect(state?.planSnapshot).toMatchObject({
      snapshotId: snapshot.snapshotId, mode: "project-review", difficulty: "pressure",
      focusAreas: ["数据产品"], allowFollowUps: false, resumeSnapshot: { title: "简历 v2", body: "我负责 SQL 周报" },
      source: { resumeId: "简历 v2" },
    });
    expect(state?.questionGraph).toHaveLength(1);
    expect(state?.questionGraph[0].answerTurnIds).toHaveLength(0);
    expect(events.some((event) => event.type === "text" && !!event.content)).toBe(true);
  });

  it("rejects a checkpoint with the right version but the wrong persisted question", async () => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    const row = await boundaries.sessions.get(42, principal.userId);
    boundaries.sessions.get.mockResolvedValueOnce(row).mockImplementationOnce(async () => ({
      ...row, interview_state_json: { ...row.interview_state_json, checkpointVersion: 2, status: "paused", currentQuestion: { ...row.interview_state_json.currentQuestion, text: "错误的题目" } },
    }));
    await expect(handleInterviewSessionTurnForAgent(principal, {
      sessionId: started.sessionId, answer: "暂停面试", requestKey: "corrupt-readback",
    })).rejects.toThrow("读回内容不一致");
  });

  it("pauses a legacy question graph with its original evidence intact and blocks resume until review", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    const row = await boundaries.sessions.get(42, principal.userId);
    const original = {
      ...createInterviewState(buildInterviewPlanSnapshot({ resumeText: "真实 SQL 经历" })),
      currentQuestionId: "legacy-q1",
      questionGraph: [{ id: "legacy-q1", question: "异常提示被推成的新题", kind: "main", answerTurnIds: ["legacy-u1"], createdAt: "2026-10-01T00:00:00Z" }],
      transcript: [{ id: "legacy-u1", role: "user", content: "周报从 5 小时到 2 小时", questionNodeId: "legacy-q1", createdAt: "2026-10-01T00:00:00Z" }],
    };
    row.interview_state_json = original;
    row.agent_state_json = {};
    const events = [];
    for await (const event of agentLoopServer({
      systemPrompt: "继续面试", messages: [{ role: "user", content: "继续" }],
      taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: "恢复历史面试" }),
      executionContext: { principal, conversationId: 42, runId: "legacy-run", requestId: "legacy-1", allowlist: [] },
    })) events.push(event);
    const paused = await boundaries.sessions.get(42, principal.userId);
    expect(paused.interview_state_json.legacyRecovery.originalState).toEqual(original);
    expect(paused.interview_state_json.status).toBe("paused");
    expect(paused.interview_state_json.answers).toHaveLength(0);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text", content: expect.stringContaining("需要复核") })]));
    const resumed = await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "继续面试", requestKey: "legacy-resume" });
    expect(resumed).toMatchObject({ action: "paused", status: "paused" });
    expect(resumed.evidence?.requiresReview).toBe(true);
    expect(resumed.message).toContain("复核");
  });

  it("keeps supporting material and rebind commands out of answers and preserves the frozen source", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理", jdText: "JD-A", cvText: "CV-A" });
    const runTurn = async (content: string, action: "use_as_supporting_context" | "auto_switch_material", requestId: string) => {
      const events = [];
      for await (const event of agentLoopServer({
        systemPrompt: "继续面试", messages: [{ role: "user", content }], interviewRebindAction: action,
        taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: content }),
        executionContext: { principal, conversationId: 42, runId: "material-run", requestId, allowlist: [] },
      })) events.push(event);
      return events;
    };
    const supportingEvents = await runTurn("参考 JD-B，不重开", "use_as_supporting_context", "supporting-1");
    const rebindEvents = await runTurn("改用 JD-B", "auto_switch_material", "rebind-1");
    const row = await boundaries.sessions.get(42, principal.userId);
    expect(row.interview_state_json.sourceBinding).toMatchObject({ jdText: "JD-A", cvText: "CV-A" });
    expect(row.interview_state_json.answers).toHaveLength(0);
    expect(row.interview_state_json.status).toBe("paused");
    expect(supportingEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "interview_state_updated", action: "material_context" })]));
    expect(rebindEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text", content: expect.stringContaining("唯一核验") })]));
    expect(rebindEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "interview_state_updated", requiresReview: true })]));
    const resumed = await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "继续面试", requestKey: "rebind-resume" });
    expect(resumed).toMatchObject({ action: "paused", status: "paused", evidence: { requiresReview: true } });
  });

  it("admits only one concurrent transition from the same checkpoint", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    const row = await boundaries.sessions.get(42, principal.userId);
    boundaries.sessions.get.mockResolvedValueOnce(structuredClone(row)).mockResolvedValueOnce(structuredClone(row));
    const results = await Promise.allSettled([
      handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "暂停面试", requestKey: "race-pause" }),
      handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "下一题", requestKey: "race-skip" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.message).toContain("另一条消息更新");
    expect((await boundaries.sessions.get(42, principal.userId)).interview_state_json.checkpointVersion).toBe(2);
  });

  it("checks persisted state before returning an idempotent start receipt", async () => {
    const principal = { userId: "user-1" };
    await startInterviewSessionForAgent(principal, { company: "甲公司", role: "AI 产品经理", requestKey: "start-receipt" });
    const row = await boundaries.sessions.get(42, principal.userId);
    boundaries.sessions.list.mockResolvedValue([row]);
    const recovered = await startInterviewSessionForAgent(principal, {
      company: "甲公司", role: "AI 产品经理", requestKey: "start-receipt",
    });
    expect(recovered).toMatchObject({ sessionId: "42", readBackVerified: true });
    expect(boundaries.sessions.create).toHaveBeenCalledTimes(1);
    row.interview_state_json.currentQuestion.text = "损坏的题目";
    await expect(startInterviewSessionForAgent(principal, {
      company: "甲公司", role: "AI 产品经理", requestKey: "start-receipt",
    })).rejects.toThrow("读回内容不一致");
  });

  it("leaves Worker transcript rows untouched when checkpoint state advances", async () => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    expect(boundaries.sessions.create.mock.calls[0][0].messages).toEqual([]);
    const row = await boundaries.sessions.get(42, principal.userId);
    const workerMessages = [{ id: "worker-message-1", role: "assistant", content: "Worker 的新消息" }];
    row.messages_json = workerMessages;
    await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "暂停面试", requestKey: "sole-writer" });
    expect((await boundaries.sessions.get(42, principal.userId)).messages_json).toEqual(workerMessages);
    expect(boundaries.sessions.update.mock.calls.every((call) => !("messages" in call[2]))).toBe(true);
  });

  it("uses the frozen preparation company and role even when a tool supplies different labels", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "原会话", role: "原岗位" });
    const row = await boundaries.sessions.get(42, principal.userId);
    row.interview_state_json = createInterviewState(buildInterviewPlanSnapshot({
      jd: { id: 7, company: "甲公司", role: "数据产品经理", body: "甲公司 JD-A" } as never,
      resumeText: "SQL 自动化 CV-A", resumeTitle: "A简历",
    }));
    row.agent_state_json = {};
    await startInterviewSessionForAgent(principal, {
      conversationId: 42, company: "乙公司", role: "Java 工程师", jdText: "JD-B", cvText: "CV-B", requestKey: "start-frozen",
    });
    const state = (await boundaries.sessions.get(42, principal.userId)).interview_state_json;
    expect(state).toMatchObject({
      company: "甲公司", role: "数据产品经理", sourceBinding: { jdId: 7, jdText: "甲公司 JD-A", cvText: "SQL 自动化 CV-A" },
    });
  });

  it("preserves natural-language difficulty and focus through checkpoint reload", async () => {
    const principal = { userId: "user-1" };
    const started = await startInterviewSessionForAgent(principal, {
      company: "甲公司", role: "AI 产品经理", difficulty: "senior", focus: "technical", requestKey: "natural-config",
    });
    let row = await boundaries.sessions.get(42, principal.userId);
    expect(row.interview_state_json).toMatchObject({ difficulty: "senior", focus: "technical", focusAreas: ["technical"] });
    await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "暂停面试", requestKey: "natural-config-pause" });
    row = await boundaries.sessions.get(42, principal.userId);
    expect(row.interview_state_json).toMatchObject({ difficulty: "senior", focus: "technical", focusAreas: ["technical"] });
    expect(projectDurableInterviewEngineState(row.interview_state_json)?.planSnapshot).toMatchObject({
      difficulty: "hard", focusAreas: ["technical"],
    });
  });

  it("keeps question-only formatting across answers and reload without changing the source or counting the instruction", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理", jdText: "JD-A", cvText: "CV-A" });
    const initial = structuredClone((await boundaries.sessions.get(42, principal.userId)).interview_state_json);
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "以后只问问题", requestKey: "format-only" });
    const next = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: "我负责SQL自动化，调研业务流程后编写脚本并推动上线，周报从5小时降到2小时，团队每周节省3小时。上线后我持续收集用户反馈，保留回滚方案并验证数据准确性。", requestKey: "format-answer-1",
    });
    const row = await boundaries.sessions.get(42, principal.userId);
    expect(row.interview_state_json.responseStyle).toBe("question_only");
    expect(row.interview_state_json.sourceBinding).toEqual(initial.sourceBinding);
    expect(next.message).toBe(next.question);
    expect(next.previousFeedback).toBeTruthy();
    expect(row.interview_state_json.answers.map((answer: { answer: string }) => answer.answer)).not.toContain("以后只问问题");
    const events = [];
    for await (const event of agentLoopServer({
      systemPrompt: "继续面试", messages: [{ role: "user", content: "下一题" }],
      taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: "简短提问" }),
      executionContext: { principal, conversationId: 42, runId: "format-reload", requestId: "format-skip", allowlist: [] },
    })) events.push(event);
    const text = events.find((event) => event.type === "text");
    const current = (await boundaries.sessions.get(42, principal.userId)).interview_state_json.currentQuestion;
    expect(text).toMatchObject({ content: current.text });
  });

  it("read-back verifies a supporting JD ledger without changing the formal binding or turning reference text into answer evidence", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理", jdText: "JD-A", cvText: "CV-A" });
    boundaries.jds.get.mockResolvedValue({ id: 8, company: "乙公司", role: "前端工程师", body: "JD-B 要求 React 和 TypeScript" });
    const resolution = {
      action: "use_as_supporting_context" as const, materialKind: "jd" as const, reason: "用户只参考",
      match: { confidence: "high" as const, score: 100, matchedBy: ["id"], record: { id: 8, kind: "jd" as const, body: "JD-B 要求 React 和 TypeScript" } },
    };
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "参考 JD-B，不重开", requestKey: "support-ledger", materialResolution: resolution });
    let row = await boundaries.sessions.get(42, principal.userId);
    expect(row.interview_state_json.sourceBinding).toMatchObject({ jdText: "JD-A", cvText: "CV-A" });
    expect(row.interview_state_json.supportingMaterials).toEqual([expect.objectContaining({
      sourceId: "8", sourceType: "jd", body: "JD-B 要求 React 和 TypeScript", contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })]);
    expect(row.interview_state_json.answers).toHaveLength(0);
    expect(boundaries.jds.get).toHaveBeenCalledWith(8, principal.userId);
    const scoreInputs: string[] = [];
    setInterviewServiceOverridesForTests({ rubricCompletion: async (request) => {
      scoreInputs.push(request.messages[0].content);
      return { text: JSON.stringify({ bands: {}, evidence: {}, states: {}, review: {} }) };
    } });
    await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: "我负责SQL自动化，调研业务流程后编写脚本并推动上线，周报从5小时降到2小时，团队每周节省3小时。上线后我持续验证准确性。", requestKey: "answer-with-support",
    });
    expect(scoreInputs[0]).toContain("JD-B 要求 React 和 TypeScript");
    expect(scoreInputs[0]).toContain("补充参考，不是候选人经历");
    row = await boundaries.sessions.get(42, principal.userId);
    expect(row.interview_state_json.answers[0].answer).not.toContain("JD-B");
    expect(row.interview_state_json.supportingMaterials).toHaveLength(1);
  });

  it("requires an exact pending confirmation before rebinding and archives the old interview instead of mixing answers", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理", jdText: "JD-A", cvText: "CV-A" });
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "我负责原项目", requestKey: "old-answer" });
    const previous = structuredClone((await boundaries.sessions.get(42, principal.userId)).interview_state_json);
    boundaries.jds.get.mockResolvedValue({ id: 8, company: "乙公司", role: "前端工程师", body: "JD-B React" });
    const resolution = {
      action: "auto_switch_material" as const, materialKind: "jd" as const, reason: "显式切换",
      match: { confidence: "high" as const, score: 100, matchedBy: ["id"], record: { id: 8, kind: "jd" as const, body: "JD-B React" } },
    };
    const asked = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: "切到乙公司前端JD", requestKey: "rebind-request", materialResolution: resolution,
    });
    let row = await boundaries.sessions.get(42, principal.userId);
    const pending = row.interview_state_json.pendingMaterialChange;
    expect(pending.confirmationId).toMatch(/^[a-f0-9]{12}$/);
    expect(asked.message).toContain(`确认换绑 ${pending.confirmationId}`);
    expect(row.interview_state_json.sourceBinding).toEqual(previous.sourceBinding);
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "确认换绑 错误编号", requestKey: "rebind-wrong" });
    expect((await boundaries.sessions.get(42, principal.userId)).interview_state_json.id).toBe(previous.id);
    const confirmed = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: `确认换绑 ${pending.confirmationId}`, requestKey: "rebind-confirmed",
    });
    row = await boundaries.sessions.get(42, principal.userId);
    expect(confirmed).toMatchObject({ action: "next", evidence: { requiresReview: false, status: "active" } });
    expect(row.interview_state_json).toMatchObject({
      company: "乙公司", role: "前端工程师", phase: "intro", questionIndex: 0, answers: [],
      sourceBinding: { jdId: 8, jdText: "JD-B React", cvText: "CV-A" },
    });
    expect(row.interview_state_json.id).not.toBe(previous.id);
    expect(row.interview_state_json.snapshotId).not.toBe(previous.snapshotId);
    expect(row.interview_state_json.archivedInterviews[0].state).toMatchObject({ id: previous.id, pendingAnswer: "我负责原项目" });
    expect(row.interview_state_json.rebindHistory).toHaveLength(1);
    const id = row.interview_state_json.id;
    await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: `确认换绑 ${pending.confirmationId}`, requestKey: "rebind-confirmed",
    });
    expect((await boundaries.sessions.get(42, principal.userId)).interview_state_json.id).toBe(id);
    expect((await boundaries.sessions.get(42, principal.userId)).interview_state_json.archivedInterviews).toHaveLength(1);
  });

  it("lets the owner review a legacy question then explicitly recover that item without promoting old inferred scores", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "数据产品经理", jdText: "JD-A", cvText: "CV-A" });
    const row = await boundaries.sessions.get(42, principal.userId);
    const original = {
      ...createInterviewState(buildInterviewPlanSnapshot({
        jd: { id: 7, company: "甲公司", role: "数据产品经理", body: "JD-A" } as never, resumeText: "CV-A",
      })),
      currentQuestionId: "legacy-q1",
      questionGraph: [{ id: "legacy-q1", question: "请介绍一次SQL自动化项目。", kind: "main", answerTurnIds: ["legacy-u1"], createdAt: "2026-10-01T00:00:00Z", score: { overall: 5 } }],
      transcript: [
        { id: "legacy-a1", role: "assistant", content: "请介绍一次SQL自动化项目。", questionNodeId: "legacy-q1" },
        { id: "legacy-u1", role: "user", content: "周报从5小时到2小时", questionNodeId: "legacy-q1" },
      ],
    };
    row.interview_state_json = original;
    row.agent_state_json = {};
    for await (const _event of agentLoopServer({
      systemPrompt: "继续面试", messages: [{ role: "user", content: "继续面试" }],
      taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: "恢复旧面试" }),
      executionContext: { principal, conversationId: 42, runId: "legacy-review", requestId: "legacy-review-migrate", allowlist: [] },
    })) {}
    const review = await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "查看历史面试复核", requestKey: "legacy-review-list" });
    const migrated = await boundaries.sessions.get(42, principal.userId);
    const confirmation = migrated.interview_state_json.legacyRecovery.review.confirmationId;
    expect(review.message).toContain("请介绍一次SQL自动化项目。");
    expect(review.message).toContain("周报从5小时到2小时");
    expect(review.message).toContain(`确认恢复题目 ${confirmation} 1`);
    expect(migrated.interview_state_json.answers).toHaveLength(0);
    const restored = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: `确认恢复题目 ${confirmation} 1`, requestKey: "legacy-review-confirm",
    });
    const state = (await boundaries.sessions.get(42, principal.userId)).interview_state_json;
    expect(restored).toMatchObject({ action: "next", evidence: { requiresReview: false } });
    expect(state).toMatchObject({ status: "active", answers: [], currentQuestion: { text: "请介绍一次SQL自动化项目。" }, sourceBinding: { jdText: "JD-A", cvText: "CV-A" } });
    expect(state.archivedInterviews[0].state.legacyRecovery.originalState).toEqual(original);
    expect(projectDurableInterviewEngineState(state)?.scoreArtifacts).toHaveLength(0);
  });

  it("rejects foreign, changed and ambiguous materials and lets the owner cancel an unresolved switch", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理", jdText: "JD-A", cvText: "CV-A" });
    const resolution = {
      action: "auto_switch_material" as const, materialKind: "jd" as const, reason: "显式切换",
      match: { confidence: "high" as const, score: 100, matchedBy: ["id"], record: { id: 8, kind: "jd" as const, body: "JD-B" } },
    };
    const foreign = await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "切换其他账号JD", requestKey: "foreign", materialResolution: resolution });
    expect(foreign.evidence?.requiresReview).toBe(true);
    expect((await boundaries.sessions.get(42, principal.userId)).interview_state_json.pendingMaterialChange.proposedMaterial).toBeUndefined();
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "保留原材料", requestKey: "cancel-foreign" });
    boundaries.jds.get.mockResolvedValue({ id: 8, company: "乙公司", role: "前端工程师", body: "JD-B" });
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "切换JD-B", requestKey: "valid-proposal", materialResolution: resolution });
    const paused = await boundaries.sessions.get(42, principal.userId);
    const pending = paused.interview_state_json.pendingMaterialChange;
    boundaries.jds.get.mockResolvedValue({ id: 8, company: "乙公司", role: "前端工程师", body: "JD-B 内容已经变化" });
    const changed = await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: `确认换绑 ${pending.confirmationId}`, requestKey: "stale-proposal" });
    expect(changed.message).toContain("已变化");
    expect(changed.evidence?.requiresReview).toBe(true);
    expect((await boundaries.sessions.get(42, principal.userId)).interview_state_json.sourceBinding.jdText).toBe("JD-A");
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: "保留原材料", requestKey: "cancel-stale" });
    const current = (await boundaries.sessions.get(42, principal.userId)).interview_state_json;
    expect(current).toMatchObject({ status: "active", answers: [] });
    expect(current.pendingMaterialChange).toBeUndefined();
    expect(current.archivedInterviews).toBeUndefined();
  });

  it("confirms JD and a verified own-resume version together as a new scene without using third-party resume facts", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理", jdText: "JD-A", cvText: "CV-A" });
    boundaries.jds.get.mockResolvedValue({ id: 8, company: "乙公司", role: "前端工程师", body: "JD-B React" });
    const sections = JSON.stringify([{ id: "projects", title: "项目", content: "本人CV-v2：SQL周报从5小时降至2小时" }]);
    const document = {
      id: "resume-doc-2", user_id: principal.userId, version_id: "v2", label: "本人简历", status: "active",
      sections_json: sections, content_hash: createHash("sha256").update(sections).digest("hex"), integrity_json: JSON.stringify({ status: "valid" }),
    };
    boundaries.resumeDocuments.list.mockResolvedValue([document]);
    boundaries.resumeDocuments.get.mockResolvedValue(document);
    await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: "用JD-B/CV-v2从头面试", requestKey: "joint-restart",
      materialResolution: {
        action: "auto_restart_interview", materialKind: "jd", reason: "重开",
        match: { confidence: "high", score: 100, matchedBy: ["id"], record: { id: 8, kind: "jd", body: "JD-B React" } },
      },
    });
    let row = await boundaries.sessions.get(42, principal.userId);
    expect(row.interview_state_json.sourceBinding.cvText).toBe("CV-A");
    const pending = row.interview_state_json.pendingMaterialChange;
    expect(pending.proposedResume).toMatchObject({ sourceId: "resume-doc-2", versionId: "v2" });
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer: `确认换绑 ${pending.confirmationId}`, requestKey: "joint-confirm" });
    row = await boundaries.sessions.get(42, principal.userId);
    expect(row.interview_state_json.sourceBinding).toMatchObject({
      jdId: 8, jdText: "JD-B React", resumeId: "resume-doc-2", resumeVersion: "v2",
    });
    expect(row.interview_state_json.sourceBinding.cvText).toContain("本人CV-v2");
    expect(boundaries.resumeDocuments.get).toHaveBeenCalledWith("resume-doc-2", principal.userId);
    expect(row.interview_state_json.answers).toHaveLength(0);
    expect(row.interview_state_json.archivedInterviews[0].state.sourceBinding.cvText).toBe("CV-A");
  });

  it("uses frozen mode, pressure difficulty and focus in actual question and rubric requests after reload", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-unused-key");
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "数据产品经理" });
    const row = await boundaries.sessions.get(42, principal.userId);
    row.interview_state_json = createInterviewState(buildInterviewPlanSnapshot({
      jd: { id: 7, company: "甲公司", role: "数据产品经理", body: "SQL 数据产品" } as never,
      resumeText: "真实项目周报从5小时降至2小时", mode: "project-review", difficulty: "pressure", focusAreas: ["SQL", "数据准确性"], allowFollowUps: false,
    }));
    row.agent_state_json = {};
    const queries: unknown[] = [];
    const generatedInputs: Array<{ systemPrompt: string; messages: Array<{ role: string; content: string }> }> = [];
    const rubricInputs: Array<{ systemPrompt: string; messages: Array<{ role: string; content: string }> }> = [];
    setInterviewServiceOverridesForTests({
      questionBankStore: {
        isAvailable: async () => true,
        queryCandidates: async (query) => {
          queries.push(query);
          return [{ id: 1, question: "请说明SQL质量验证的真实项目。", topic: "SQL", family: "ai_product", phase: "intro", difficulty: "senior", provenance: "fixture", provenanceDetail: "isolated-provider-fixture", answerPoints: "真实证据" }];
        },
      },
      bankCompletion: async (request) => {
        generatedInputs.push(request);
        return { text: JSON.stringify({ questions: [{ question: "请说明SQL质量验证的真实项目。", source: "bank", provenance: "fixture" }] }) };
      },
      rubricCompletion: async (request) => {
        rubricInputs.push(request);
        return { text: JSON.stringify({ bands: { structure: 1, specificity: 1, highlight: 1, timing: 1 }, evidence: { structure: "SQL", specificity: "5小时", highlight: "真实项目", timing: "团队" }, states: {}, review: {} }) };
      },
    });
    try {
      for await (const _event of agentLoopServer({
        systemPrompt: "开始面试", messages: [{ role: "user", content: "开始面试" }],
        taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: "按准备配置" }),
        executionContext: { principal, conversationId: 42, runId: "config-run", requestId: "config-start", allowlist: [] },
      })) {}
      await handleInterviewSessionTurnForAgent(principal, {
        sessionId: "42", answer: "我负责SQL质量验证，真实项目周报从5小时降至2小时，并给团队提供校验与回滚方案。", requestKey: "config-answer",
      });
      expect(queries[0]).toMatchObject({ difficulty: "senior" });
      expect(generatedInputs[0].systemPrompt).toContain("项目复盘");
      expect(generatedInputs[0].messages[0].content).toContain("pressure");
      expect(generatedInputs[0].messages[0].content).toContain("数据准确性");
      expect(rubricInputs[0].systemPrompt).toContain("项目复盘");
      expect(rubricInputs[0].messages[0].content).toContain("pressure");
      expect(rubricInputs[0].messages[0].content).toContain("数据准确性");
      expect((await boundaries.sessions.get(42, principal.userId)).interview_state_json.currentFollowups).toHaveLength(0);
    } finally { vi.unstubAllEnvs(); }
  });

  it.each(["unresolved-jd", "ambiguous-resume", "changed-resume"])("rejects an incomplete or changed joint JD/CV request: %s", async (scenario) => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理", jdText: "JD-A", cvText: "CV-A" });
    const sections = JSON.stringify([{ id: "projects", title: "项目", content: "本人CV-v2：SQL周报从5小时降至2小时" }]);
    const document = {
      id: "resume-doc-2", user_id: principal.userId, version_id: "v2", label: "本人简历", status: "active",
      sections_json: sections, content_hash: createHash("sha256").update(sections).digest("hex"), integrity_json: JSON.stringify({ status: "valid" }),
    };
    boundaries.resumeDocuments.list.mockResolvedValue(scenario === "ambiguous-resume" ? [document, { ...document, id: "duplicate-v2" }] : [document]);
    boundaries.resumeDocuments.get.mockResolvedValue(document);
    boundaries.jds.get.mockResolvedValue(scenario === "unresolved-jd" ? undefined : { id: 8, company: "乙公司", role: "前端工程师", body: "JD-B React" });
    const requested = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: "用JD-B/CV-v2从头面试", requestKey: `joint-${scenario}`,
      materialResolution: {
        action: "auto_restart_interview", materialKind: "jd", reason: "重开",
        match: { confidence: "high", score: 100, matchedBy: ["id"], record: { id: 8, kind: "jd", body: "JD-B React" } },
      },
    });
    const pending = (await boundaries.sessions.get(42, principal.userId)).interview_state_json.pendingMaterialChange;
    if (scenario === "changed-resume") boundaries.resumeDocuments.get.mockResolvedValue({ ...document, sections_json: JSON.stringify([{ ...JSON.parse(sections)[0], content: "已被修改" }]) });
    else expect(requested.message).not.toContain(`确认换绑 ${pending.confirmationId}`);
    const confirmed = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: "42", answer: `确认换绑 ${pending.confirmationId}`, requestKey: `confirm-${scenario}`,
    });
    const state = (await boundaries.sessions.get(42, principal.userId)).interview_state_json;
    expect(confirmed).toMatchObject({ action: "paused", evidence: { requiresReview: true } });
    expect(state.sourceBinding).toMatchObject({ jdText: "JD-A", cvText: "CV-A" });
    expect(state.archivedInterviews).toBeUndefined();
    expect(state.answers).toHaveLength(0);
  });

  it("does not write weakness trends before an answer wins its checkpoint", async () => {
    const principal = { userId: "user-1" };
    await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "AI 产品经理" });
    setInterviewServiceOverridesForTests({ rubricCompletion: async () => ({ text: JSON.stringify({
        bands: { structure: 1, specificity: 1, highlight: 1, timing: 1 }, overallBand: 1,
        evidence: { structure: "我负责项目", specificity: "从5小时降到2小时", highlight: "我负责项目", timing: "两分钟" },
        states: { structure: "none", specificity: "none", highlight: "none", timing: "none" },
        review: { effectiveEvidence: "具体数字", mainGaps: "结构待补充", stateVerdict: "表达待加强", betterStructure: "先说明职责" },
    }) }) });
    boundaries.sessions.update.mockResolvedValueOnce(false);
    const answer = "我负责项目，分析系统流程并实现SQL自动化，周报从5小时降到2小时，能在两分钟说明动作和真实结果，同时列出后续复盘改进项。";
    await expect(handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer, requestKey: "lost-answer" })).rejects.toThrow("另一条消息更新");
    expect(boundaries.recordWeaknessEvent).not.toHaveBeenCalled();
    await handleInterviewSessionTurnForAgent(principal, { sessionId: "42", answer, requestKey: "lost-answer" });
    expect(boundaries.recordWeaknessEvent).toHaveBeenCalledTimes(4);
    expect(boundaries.recordWeaknessEvent).toHaveBeenCalledWith(expect.objectContaining({
      sessionSurrogate: "sess:42", userId: "user-1", band: 1,
    }));
  });
});
