import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/memory-context", () => ({
  assembleAgentMemoryContext: async () => ({ llmSummary: "隔离测试记忆" }),
}));
vi.mock("@/lib/llm-retry", () => ({
  llmRetry: async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      questions: [{ category: "technical", question: "请说明你负责的SQL校验项目与真实结果。", source: "jd" }],
    }) } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } }),
}));

import { getDataRepositories } from "@/lib/data-repositories";
import { getPostgresPool } from "@/lib/postgres";
import { handleInterviewSessionTurnForAgent } from "@/lib/server/interview-analysis-service";
import { buildInterviewPlanSnapshot, createInterviewState, projectDurableInterviewEngineState } from "@/lib/agent/interview-session-state";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import { resumeDocumentProjectionFromCvData } from "@/lib/resume/document";

const fixtureUrl = process.env.SPEC40_INTERVIEW_DATABASE_URL;
const fixtureUserId = `spec40-interview-${randomUUID()}`;
let fixtureConnected = false;

function parseObject(value: unknown): Record<string, any> {
  return typeof value === "string" ? JSON.parse(value) : value as Record<string, any>;
}

describe.skipIf(!fixtureUrl)("isolated real PostgreSQL interview persistence", () => {
  beforeAll(async () => {
    const target = new URL(fixtureUrl!);
    if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== "55440" || target.pathname !== "/spec40_interview") {
      throw new Error("Interview integration fixtures require localhost:55440/spec40_interview");
    }
    vi.stubEnv("DB_DRIVER", "postgres");
    vi.stubEnv("DATABASE_URL", fixtureUrl!);
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-unused-key");
    fixtureConnected = true;
    await getPostgresPool().query(
      "INSERT INTO users (id, username, password_hash, display_name, status) VALUES ($1, $1, 'synthetic-not-a-password', 'Spec40 interview fixture', 'active')",
      [fixtureUserId],
    );
  });

  afterAll(async () => {
    if (!fixtureConnected) return;
    const pool = getPostgresPool();
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [fixtureUserId]);
    await pool.query("DELETE FROM resume_documents WHERE user_id = $1", [fixtureUserId]);
    await pool.query("DELETE FROM jds WHERE user_id = $1", [fixtureUserId]);
    await pool.query("DELETE FROM users WHERE id = $1", [fixtureUserId]);
    await pool.end();
    vi.unstubAllEnvs();
  });

  it("allows one concurrent CAS winner and preserves independently read Worker messages and source binding", async () => {
    const sessions = getDataRepositories().sessions;
    const messages = [{ role: "user", content: "Worker拥有的原始问题" }, { role: "assistant", content: "Worker拥有的原始输出" }];
    const sourceBinding = { jdId: 7, jdText: "原JD", cvText: "原简历" };
    const sessionId = await sessions.create({ title: "Spec40 CAS fixture", messages, interviewState: { checkpointVersion: 1, sourceBinding, currentQuestion: { id: "q1" } } }, fixtureUserId);
    const writers = ["winner-a", "winner-b"].map((questionId) => sessions.update(sessionId, fixtureUserId, {
      expectedInterviewCheckpointVersion: 1,
      interviewState: { checkpointVersion: 2, sourceBinding, currentQuestion: { id: questionId } },
      agentState: { checkpointVersion: 2, questionId },
    }));
    const saved = await Promise.all(writers);
    expect(saved.filter(Boolean)).toHaveLength(1);
    const independent = await getPostgresPool().query("SELECT * FROM sessions WHERE id = $1 AND user_id = $2", [sessionId, fixtureUserId]);
    const row = independent.rows[0];
    expect(row.interview_state_json.currentQuestion.id).toBe(saved[0] ? "winner-a" : "winner-b");
    expect(row.interview_state_json.sourceBinding).toEqual(sourceBinding);
    expect(row.messages_json).toEqual(messages);
    expect(await sessions.update(sessionId, fixtureUserId, { interviewState: { checkpointVersion: 3 }, expectedInterviewCheckpointVersion: 1 })).toBe(false);
    expect(await sessions.update(sessionId, "foreign-owner", { interviewState: { checkpointVersion: 3 }, expectedInterviewCheckpointVersion: 2 })).toBe(false);
    expect(await sessions.get(sessionId, "foreign-owner")).toBeUndefined();
    expect(await sessions.update(sessionId, fixtureUserId, { interviewState: { planSnapshot: {}, questionGraph: [] } })).toBe(false);
    expect(await sessions.update(sessionId, fixtureUserId, { agentState: { questionId: "late-background" } })).toBe(false);
    expect(parseObject((await sessions.get(sessionId, fixtureUserId))?.interview_state_json)).toEqual(row.interview_state_json);
  });

  it("read-back verifies pause, reload and idempotent resume using actual JSONB repositories", async () => {
    const principal = { userId: fixtureUserId };
    const started = await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "数据产品经理", jdText: "SQL与数据校验", cvText: "本人周报从5小时降至2小时", requestKey: "pg-start" });
    const sessionId = Number(started.sessionId);
    const original = await getPostgresPool().query("SELECT messages_json, interview_state_json FROM sessions WHERE id = $1", [sessionId]);
    const paused = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "暂停面试", requestKey: "pg-pause" });
    expect(paused).toMatchObject({ action: "paused", readBackVerified: true });
    const pausedRow = await getDataRepositories().sessions.get(sessionId, fixtureUserId);
    expect(projectDurableInterviewEngineState(pausedRow?.interview_state_json)?.status).toBe("paused");
    const resumed = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "继续面试", requestKey: "pg-resume" });
    const repeated = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: "继续面试", requestKey: "pg-resume" });
    expect(resumed).toMatchObject({ action: "resumed", question: started.question, readBackVerified: true });
    expect(repeated).toMatchObject({ recovered: true, evidence: { checkpointVersion: resumed.evidence?.checkpointVersion } });
    const independent = await getPostgresPool().query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
    expect(independent.rows[0].interview_state_json.answers).toEqual([]);
    expect(independent.rows[0].messages_json).toEqual(original.rows[0].messages_json);
    expect(independent.rows[0].agent_state_json.checkpointStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("migrates a prepared snapshot and isolates a dirty legacy transcript across actual JSONB reloads", async () => {
    const principal = { userId: fixtureUserId };
    const prepared = createInterviewState(buildInterviewPlanSnapshot({
      jd: { id: 7, company: "甲公司", role: "数据产品经理", body: "SQL与数据校验" } as never,
      resumeText: "本人周报从5小时降至2小时", mode: "project-review", difficulty: "pressure", focusAreas: ["SQL"], allowFollowUps: false,
    }));
    const legacy = {
      ...prepared, currentQuestionId: "legacy-error",
      questionGraph: [{ id: "legacy-error", question: "模型错误：请求失败", kind: "main", answerTurnIds: ["legacy-user"] }],
      transcript: [{ id: "legacy-assistant", role: "assistant", content: "模型错误：请求失败", questionNodeId: "legacy-error" }, { id: "legacy-user", role: "user", content: "污染回答", questionNodeId: "legacy-error" }],
    };
    for (const [index, state] of [prepared, legacy].entries()) {
      const sessionId = await getDataRepositories().sessions.create({ title: "Spec40 migration fixture", interviewState: state, messages: [{ role: "user", content: "Worker原文" }] }, fixtureUserId);
      for await (const event of agentLoopServer({
        systemPrompt: "继续面试", messages: [{ role: "user", content: "继续面试" }],
        taskContract: createAgentTaskContract({ taskType: "interview_coaching", target: "恢复准备状态" }),
        executionContext: { principal, conversationId: sessionId, runId: `pg-migrate-${index}`, requestId: `pg-migrate-${index}`, allowlist: [] },
      })) { expect(event).toBeDefined(); }
      const row = await getDataRepositories().sessions.get(sessionId, fixtureUserId);
      const durable = parseObject(row?.interview_state_json);
      expect(durable).toMatchObject({ sourceBinding: { jdText: "SQL与数据校验", cvText: "本人周报从5小时降至2小时" }, mode: "project-review", difficulty: "pressure", allowFollowUps: false, answers: [] });
      if (index === 0) expect(durable.status).toBe("active");
      else {
        expect(durable).toMatchObject({ status: "paused", legacyRecovery: { requiresReview: true, originalState: legacy } });
        expect(durable.currentQuestion).toBeUndefined();
        const reviewed = await handleInterviewSessionTurnForAgent(principal, { sessionId: String(sessionId), answer: "查看历史面试复核", requestKey: "pg-legacy-review" });
        expect(reviewed.message).toContain("未找到有原始助手记录支持的题目");
        const reviewedState = parseObject((await getDataRepositories().sessions.get(sessionId, fixtureUserId))?.interview_state_json);
        expect(reviewedState.legacyRecovery.review.questions).toHaveLength(0);
        const restarted = await handleInterviewSessionTurnForAgent(principal, { sessionId: String(sessionId), answer: `确认从头面试 ${reviewedState.legacyRecovery.review.confirmationId}`, requestKey: "pg-legacy-restart" });
        expect(restarted).toMatchObject({ action: "next", readBackVerified: true });
        const recovered = parseObject((await getDataRepositories().sessions.get(sessionId, fixtureUserId))?.interview_state_json);
        expect(recovered.answers).toHaveLength(0);
        expect(recovered.archivedInterviews[0].state.legacyRecovery.originalState).toEqual(legacy);
      }
    }
  });

  it.each([false, true])("verifies a legal reordered CV after PostgreSQL JSONB serialization and rejects content tampering: %s", async (tampered) => {
    const principal = { userId: fixtureUserId };
    const versionId = tampered ? "v3" : "v2";
    const sections = [{ content: "本人CV-v2：SQL周报从5小时降至2小时", title: "项目", id: "projects" }];
    const projection = resumeDocumentProjectionFromCvData({ activeVersion: versionId, versions: { [versionId]: { sections } } })!;
    const documentId = `spec40-resume-${randomUUID()}`;
    const documentHash = projection.contentHash;
    await getPostgresPool().query(
      "INSERT INTO resume_documents (id, user_id, version_id, label, status, content_hash, sections_json, integrity_json) VALUES ($1, $2, $3, '本人简历', 'archived', $4, $5::jsonb, $6::jsonb)",
      [documentId, fixtureUserId, versionId, documentHash, JSON.stringify(sections), JSON.stringify({ status: "valid" })],
    );
    if (tampered) await getPostgresPool().query("UPDATE resume_documents SET sections_json = $1::jsonb WHERE id = $2 AND user_id = $3", [JSON.stringify([{ ...sections[0], content: "伪造结果900%" }]), documentId, fixtureUserId]);
    const started = await handleInterviewSessionTurnForAgent(principal, { company: "甲公司", role: "数据产品经理", jdText: "JD-A", cvText: "CV-A", requestKey: "pg-resume-start" });
    const sessionId = Number(started.sessionId);
    const requested = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: `用CV-${versionId}从头面试`, requestKey: `pg-cv-rebind-${versionId}` });
    const state = parseObject((await getDataRepositories().sessions.get(sessionId, fixtureUserId))?.interview_state_json);
    if (tampered) {
      expect(state.pendingMaterialChange.proposedResume).toBeUndefined();
      const denied = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: `确认换绑 ${state.pendingMaterialChange.confirmationId}`, requestKey: "pg-tamper-confirm" });
      expect(denied).toMatchObject({ action: "paused", evidence: { requiresReview: true } });
      const unchanged = parseObject((await getDataRepositories().sessions.get(sessionId, fixtureUserId))?.interview_state_json);
      expect(unchanged.sourceBinding.cvText).toBe("CV-A");
      expect(unchanged.archivedInterviews).toBeUndefined();
      return;
    }
    expect(state.pendingMaterialChange.proposedResume).toMatchObject({ sourceId: documentId, versionId, contentHash: documentHash });
    expect(requested.message).toContain(`确认换绑 ${state.pendingMaterialChange.confirmationId}`);
    const confirmed = await handleInterviewSessionTurnForAgent(principal, { sessionId: started.sessionId, answer: `确认换绑 ${state.pendingMaterialChange.confirmationId}`, requestKey: "pg-cv-confirm" });
    expect(confirmed).toMatchObject({ action: "next", readBackVerified: true });
    const rebound = parseObject((await getDataRepositories().sessions.get(sessionId, fixtureUserId))?.interview_state_json);
    expect(rebound.sourceBinding).toMatchObject({ resumeId: documentId, resumeVersion: versionId, resumeContentHash: documentHash, jdText: "JD-A" });
    expect(rebound.sourceBinding.cvText).toContain("本人CV-v2：SQL周报从5小时降至2小时");
    expect(rebound.archivedInterviews[0].state.sourceBinding.cvText).toBe("CV-A");
  });
});
