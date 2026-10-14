import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { test, type Browser } from "@e2e-dev/web";
import { credentials, expect } from "e2e";
import { requireInterviewEvidenceId, writeImmutableInterviewEvidence } from "../../scripts/lib/spec40-interview-evidence.mjs";

type InterviewQuestion = { id: string; text: string };
type InterviewAnswer = {
  questionId: string; question: string; answer: string; score?: number; feedback?: string;
  rubric?: { evidence: Record<string, string>; bands: Record<string, number>; overallBand: number };
};
type InterviewState = {
  id: string; status: string; checkpointVersion: number; currentQuestion: InterviewQuestion;
  answers: InterviewAnswer[]; questions: InterviewQuestion[]; sourceBinding: { jdText: string; cvText: string };
  responseStyle?: string; archivedInterviews?: unknown[];
  pendingMaterialChange?: { confirmationId: string; proposedResume?: unknown };
};
type Session = {
  interview_state_json: InterviewState | string;
  messages_json: Array<{ role: string; content: string }> | string;
  durable_execution_messages?: Array<{ role: string; content: string }>;
};
type Run = { id: string; status: string; conversationId: number; taskType: string };
const fixture = JSON.parse(fs.readFileSync(".private/spec40/interview/fixture.json", "utf8"));
const realModel = process.env.SPEC40_INTERVIEW_MODEL_MODE === "real";
const evidenceId = requireInterviewEvidenceId(process.env.SPEC40_INTERVIEW_EVIDENCE_ID);
const evidenceDirectory = path.resolve(".e2e/spec40-third-interview/oracles", evidenceId);
fs.mkdirSync(evidenceDirectory, { recursive: true });
writeImmutableInterviewEvidence(path.join(evidenceDirectory, "metadata.json"), {
  fixtureVersion: fixture.sourceVersion, workerHash: fixture.workerHash,
  requestedModel: realModel ? "real-deepseek-flash" : "unconfigured-fallback-unscored",
  database: "spec40_interview_external", runtimeMode: "worker_all",
});

async function request<Value>(browser: Browser, route: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return browser.evaluate(async (serialized) => {
    const { route, body, method } = JSON.parse(String(serialized)) as { route: string; body?: unknown; method: string };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const response = await fetch(route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }, JSON.stringify({ route, body, method })) as Promise<{ status: number; body: Value }>;
}

function stateOf(session: Session): InterviewState {
  return typeof session.interview_state_json === "string" ? JSON.parse(session.interview_state_json) : session.interview_state_json;
}

function messagesOf(session: Session) {
  if (session.durable_execution_messages) return session.durable_execution_messages;
  return typeof session.messages_json === "string" ? JSON.parse(session.messages_json) as Array<{ role: string; content: string }> : session.messages_json;
}

async function independentReadback(sessionId: number, evidenceName: string): Promise<Session> {
  const client = new pg.Client({ connectionString: fixture.connectionString });
  await client.connect();
  try {
    const runtime = JSON.parse(fs.readFileSync(path.resolve(".private/spec40/interview/runtime-" + path.basename(evidenceDirectory) + ".json"), "utf8"));
    expect(runtime.mode).toBe(realModel ? "real" : "keyless");
    expect(runtime.deepseekConfigured).toBe(realModel);
    expect(runtime.workerHash).toBe(fixture.workerHash);
    writeImmutableInterviewEvidence(path.join(evidenceDirectory, "runtime-mode.json"), runtime);
    const identity = await client.query("SELECT current_database() AS name");
    expect(identity.rows[0].name).toBe("spec40_interview_external");
    const result = await client.query("SELECT id, user_id, interview_state_json, agent_state_json, messages_json FROM sessions WHERE id = $1 AND user_id = $2", [sessionId, fixture.users.owner.id]);
    expect(result.rows).toHaveLength(1);
    const readback = result.rows[0] as Session;
    const memory = await client.query("SELECT content FROM session_memory WHERE user_id = $1 AND session_id = $2 AND summary_type = $3 ORDER BY id DESC LIMIT 1", [fixture.users.owner.id, sessionId, "execution_conversation"]);
    expect(memory.rows).toHaveLength(1);
    readback.durable_execution_messages = JSON.parse(memory.rows[0].content);
    writeImmutableInterviewEvidence(path.join(evidenceDirectory, evidenceName + ".json"), result.rows[0]);
    return readback;
  } finally { await client.end(); }
}

async function assertForbiddenSideEffectsAbsent(evidenceName: string) {
  const client = new pg.Client({ connectionString: fixture.connectionString });
  await client.connect();
  try {
    const counts: Record<string, number> = {};
    for (const table of ["profiles", "cv_data", "memory_facts", "offers", "offer_reports", "applications"]) {
      const count = await client.query("SELECT COUNT(*)::int AS count FROM " + table + " WHERE user_id = $1", [fixture.users.owner.id]);
      counts[table] = count.rows[0].count;
      expect(count.rows[0].count).toBe(0);
    }
    writeImmutableInterviewEvidence(path.join(evidenceDirectory, evidenceName + ".json"), counts);
  } finally { await client.end(); }
}

async function createPrepared(browser: Browser, label: string) {
  const created = await request<{ data: { id: number } }>(browser, "/api/sessions", {
    title: "Spec40 external interview " + label,
    interviewState: { status: "active", questionGraph: [], transcript: [], scoreArtifacts: [], rebindHistory: [],
      planSnapshot: { snapshotId: randomUUID(), source: { resumeId: "synthetic-original" },
        jdSnapshot: { company: "合成公司", role: "数据产品经理", body: "SYNTHETIC_JD_A：要求SQL与数据校验" },
        resumeSnapshot: { title: "合成本人CV", body: "SYNTHETIC_CV_A：本人周报从5小时降至2小时" },
        mode: "project-review", difficulty: "pressure", focusAreas: ["SQL"], allowFollowUps: false, createdAt: new Date().toISOString() },
    },
  });
  expect(created.status).toBe(201);
  return created.body.data.id;
}

async function turn(browser: Browser, sessionId: number, content: string, requestId = randomUUID(), expectedStatus = "succeeded") {
  const accepted = await request<{ data: { run: Run; replayed: boolean } }>(browser, "/api/agent/runs", {
    requestId, conversationId: sessionId, input: { content }, taskType: "interview_coaching", entryHints: { agentId: "interview" },
  });
  expect([200, 201]).toContain(accepted.status);
  const run = accepted.body.data.run;
  expect(run).toMatchObject({ conversationId: sessionId, taskType: "interview_coaching" });
  await expect.poll(async () => ["succeeded", "waiting_user", "failed", "cancelled", "paused"].includes(
    (await request<{ data: { run: Run } }>(browser, "/api/agent/runs/" + run.id)).body.data.run.status),
  { timeout: realModel ? 240_000 : 45_000, message: "The authenticated Run must finish through the production Worker" }).toBe(true);
  const read = await request<{ data: Session }>(browser, "/api/sessions/" + sessionId);
  expect(read.status).toBe(200);
  await independentReadback(sessionId, "turn-" + run.id + "-" + randomUUID());
  const completed = await request<{ data: { run: Run } }>(browser, "/api/agent/runs/" + run.id);
  expect(completed.body.data.run.status).toBe(expectedStatus);
  return { run, session: read.body.data, requestId, replayed: accepted.body.data.replayed };
}

test("ISS-001 external original answer binding survives pause, refresh and resume; controls never become answers", async ({ app, screen, browser }) => {
  await app.open("/login");
  await screen.getByPlaceholder("输入用户名").fill(credentials.user("interviewOwner").username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user("interviewOwner").password);
  await screen.getByRole("button", "登 录").tap();
  await expect(browser).toHaveURL("/");
  await expect(screen.getByRole("heading", "今日手账", { level: 1 })).toBeVisible();
  const sessionId = await createPrepared(browser, "answer-pause-" + randomUUID());
  const started = await turn(browser, sessionId, "开始模拟面试");
  const original = stateOf(started.session);
  expect(original.sourceBinding).toMatchObject({
    jdText: "SYNTHETIC_JD_A：要求SQL与数据校验", cvText: "SYNTHETIC_CV_A：本人周报从5小时降至2小时",
  });
  expect(original.currentQuestion.text.length).toBeGreaterThan(10);
  if (!realModel) expect(original.currentQuestion.text).toContain("介绍一下你自己");
  expect(original.answers).toHaveLength(0);
  const answer = "SYNTHETIC_ANSWER_A：我独立负责SQL周报校验，先核对数据口径，再增加自动规则，最后把人工整理从5小时降到2小时。";
  const answered = await turn(browser, sessionId, answer);
  const afterAnswer = stateOf(answered.session);
  expect(afterAnswer.answers).toHaveLength(1);
  expect(afterAnswer.answers[0]).toMatchObject({ questionId: original.currentQuestion.id, question: original.currentQuestion.text, answer });
  if (realModel) {
    expect(Number.isFinite(afterAnswer.answers[0].score)).toBe(true);
    expect(afterAnswer.answers[0].score!).toBeGreaterThanOrEqual(2);
    expect(afterAnswer.answers[0].score!).toBeLessThanOrEqual(10);
    expect(afterAnswer.answers[0].rubric).toBeDefined();
    const rubric = afterAnswer.answers[0].rubric!;
    expect(Number.isInteger(rubric.overallBand)).toBe(true);
    expect(rubric.overallBand).toBeGreaterThanOrEqual(0);
    expect(rubric.overallBand).toBeLessThanOrEqual(4);
    expect(Object.keys(rubric.bands).sort()).toEqual(["highlight", "specificity", "structure", "timing"]);
    expect(Object.keys(rubric.evidence).sort()).toEqual(["highlight", "specificity", "structure", "timing"]);
    for (const dimension of ["highlight", "specificity", "structure", "timing"]) {
      expect(Number.isInteger(rubric.bands[dimension])).toBe(true);
      expect(rubric.bands[dimension]).toBeGreaterThanOrEqual(0);
      expect(rubric.bands[dimension]).toBeLessThanOrEqual(4);
      expect(rubric.evidence[dimension].trim().length).toBeGreaterThanOrEqual(2);
      expect(answer).toContain(rubric.evidence[dimension]);
    }
    expect(afterAnswer.answers[0].score).toBe(2 * (1 + rubric.overallBand));
  } else {
    expect(afterAnswer.answers[0].score).toBeUndefined();
    expect(afterAnswer.answers[0].feedback).toContain("评分暂时不可用");
  }
  const pause = await turn(browser, sessionId, "暂停面试");
  const paused = stateOf(pause.session);
  expect(paused.status).toBe("paused");
  expect(paused.currentQuestion).toEqual(afterAnswer.currentQuestion);
  expect(paused.answers).toEqual(afterAnswer.answers);
  await browser.goto("/agent?sessionId=" + sessionId);
  await expect(screen.getByText("面试已暂停", { exact: false }).first()).toBeVisible();
  await browser.reload();
  await expect(screen.getByPlaceholder("继续对话…")).toBeVisible();
  const refreshed = await request<{ data: Session }>(browser, "/api/sessions/" + sessionId);
  expect(stateOf(refreshed.body.data)).toEqual(paused);
  const resumed = await turn(browser, sessionId, "继续面试");
  const active = stateOf(resumed.session);
  expect(active.status).toBe("active");
  expect(active.currentQuestion).toEqual(paused.currentQuestion);
  expect(active.sourceBinding).toEqual(original.sourceBinding);
  expect(active.answers).toEqual(afterAnswer.answers);
  const independent = await independentReadback(sessionId, "answer-pause-resume");
  expect(stateOf(independent)).toEqual(active);
  expect(messagesOf(independent).map(({ role, content }) => ({ role, content }))).toEqual(
    messagesOf(resumed.session).map(({ role, content }) => ({ role, content })),
  );
  const users = messagesOf(independent).filter((message) => message.role === "user");
  expect(users.map((message) => message.content)).toEqual(["开始模拟面试", answer, "暂停面试", "继续面试"]);
  expect(active.answers.some((item) => /暂停面试|继续面试/.test(item.answer))).toBe(false);
  await assertForbiddenSideEffectsAbsent("answer-control-forbidden-side-effects");
});

test("external question-only persists across new Run and refresh; duplicate request cannot advance twice", async ({ app, screen, browser }) => {
  await app.open("/login");
  await screen.getByPlaceholder("输入用户名").fill(credentials.user("interviewOwner").username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user("interviewOwner").password);
  await screen.getByRole("button", "登 录").tap();
  await expect(browser).toHaveURL("/");
  await expect(screen.getByRole("heading", "今日手账", { level: 1 })).toBeVisible();
  const sessionId = await createPrepared(browser, "question-only-" + randomUUID());
  await turn(browser, sessionId, "开始模拟面试");
  const formatted = await turn(browser, sessionId, "只问问题，不要解释");
  expect(stateOf(formatted.session).responseStyle).toBe("question_only");
  expect(stateOf(formatted.session).answers).toHaveLength(0);
  const answer = "SYNTHETIC_ANSWER_B：本人负责SQL规则和结果验收，执行口径检查后把周报整理从5小时降至2小时。";
  const requestId = randomUUID();
  const answered = await turn(browser, sessionId, answer, requestId);
  const state = stateOf(answered.session);
  expect(messagesOf(answered.session).findLast((message) => message.role === "assistant")?.content).toBe(state.currentQuestion.text);
  const replay = await turn(browser, sessionId, answer, requestId);
  expect(replay.run.id).toBe(answered.run.id);
  expect(replay.replayed).toBe(true);
  expect(stateOf(replay.session)).toEqual(state);
  await browser.goto("/agent?sessionId=" + sessionId);
  await expect(screen.getByPlaceholder("继续对话…")).toBeVisible();
  await browser.reload();
  await expect(screen.getByPlaceholder("继续对话…")).toBeVisible();
  const resumed = await turn(browser, sessionId, "继续面试");
  expect(stateOf(resumed.session).answers).toHaveLength(1);
  expect(messagesOf(resumed.session).findLast((message) => message.role === "assistant")?.content).toBe(state.currentQuestion.text);
  const independent = await independentReadback(sessionId, "question-only-duplicate-refresh");
  expect(messagesOf(independent).filter((message) => message.role === "user" && message.content === answer)).toHaveLength(1);
  const forgery = await request(browser, "/api/sessions/" + sessionId, { interviewState: { checkpointVersion: 999, answers: [] } }, "PATCH");
  expect(forgery.status).toBe(422);
  expect(stateOf(await independentReadback(sessionId, "rejected-browser-checkpoint"))).toEqual(stateOf(independent));
});

test("external missing CV and wrong confirmation keep original binding, and cross-owner cannot read or submit", async ({ app, screen, browser }) => {
  await app.open("/login");
  await screen.getByPlaceholder("输入用户名").fill(credentials.user("interviewOwner").username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user("interviewOwner").password);
  await screen.getByRole("button", "登 录").tap();
  await expect(browser).toHaveURL("/");
  await expect(screen.getByRole("heading", "今日手账", { level: 1 })).toBeVisible();
  const sessionId = await createPrepared(browser, "negative-rebind-" + randomUUID());
  const started = await turn(browser, sessionId, "开始模拟面试");
  const original = stateOf(started.session);
  const proposed = await turn(browser, sessionId, "用CV-v999从头面试", randomUUID(), "waiting_user");
  const pending = stateOf(proposed.session);
  expect(pending.status).toBe("paused");
  expect(pending.sourceBinding).toEqual(original.sourceBinding);
  expect(pending.pendingMaterialChange).toMatchObject({ action: "ask_clarification", requiresReview: true });
  expect(pending.pendingMaterialChange?.proposedResume).toBeUndefined();
  const wrong = await turn(browser, sessionId, "确认换绑 wrong-confirmation-id", randomUUID(), "waiting_user");
  expect(stateOf(wrong.session).sourceBinding).toEqual(original.sourceBinding);
  expect(stateOf(wrong.session).answers).toHaveLength(0);
  expect(stateOf(wrong.session).archivedInterviews).toBeUndefined();
  const wrongToken = pending.pendingMaterialChange!.confirmationId === "ffffffffffff" ? "000000000000" : "ffffffffffff";
  const mismatched = await turn(browser, sessionId, "确认换绑 " + wrongToken, randomUUID(), "waiting_user");
  expect(stateOf(mismatched.session).pendingMaterialChange).toEqual(pending.pendingMaterialChange);
  expect(stateOf(mismatched.session).sourceBinding).toEqual(original.sourceBinding);
  expect(stateOf(mismatched.session).currentQuestion).toEqual(original.currentQuestion);
  expect(stateOf(mismatched.session).answers).toHaveLength(0);
  const denied = await turn(browser, sessionId, "确认换绑 " + pending.pendingMaterialChange!.confirmationId, randomUUID(), "waiting_user");
  expect(stateOf(denied.session).sourceBinding).toEqual(original.sourceBinding);
  expect(stateOf(denied.session).status).toBe("paused");
  const retained = await turn(browser, sessionId, "保留原材料");
  expect(stateOf(retained.session).status).toBe("active");
  expect(stateOf(retained.session).pendingMaterialChange).toBeUndefined();
  expect(stateOf(retained.session).currentQuestion).toEqual(original.currentQuestion);
  expect(stateOf(retained.session).sourceBinding).toEqual(original.sourceBinding);
  const independent = await independentReadback(sessionId, "missing-cv-and-wrong-confirmation");
  expect(stateOf(independent).answers).toHaveLength(0);
  await request(browser, "/api/auth/logout", {});
  await browser.goto("/login");
  await screen.getByPlaceholder("输入用户名").fill(credentials.user("interviewForeign").username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user("interviewForeign").password);
  await screen.getByRole("button", "登 录").tap();
  await expect(browser).toHaveURL("/");
  await expect(screen.getByRole("heading", "今日手账", { level: 1 })).toBeVisible();
  expect((await request(browser, "/api/sessions/" + sessionId)).status).toBe(404);
  expect((await request(browser, "/api/agent/runs/" + denied.run.id)).status).toBe(404);
  const foreignInput = await request(browser, "/api/agent/runs/" + denied.run.id + "/inputs", { requestId: randomUUID(), input: { content: "伪造答案" } });
  expect([403, 404]).toContain(foreignInput.status);
  expect(stateOf(await independentReadback(sessionId, "foreign-owner-denied"))).toEqual(stateOf(independent));
  await assertForbiddenSideEffectsAbsent("rebind-control-forbidden-side-effects");
});
