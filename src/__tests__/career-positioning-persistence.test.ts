import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCareerPositioningArtifact, buildCareerPositioningFallback, type PositioningMessage } from "@/lib/agent/career-positioning-result";

const USER_ID = "positioning-persistence-user";
let directory: string | undefined;
let database: typeof import("@/lib/server-db") | undefined;

async function harness() {
  vi.resetModules();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "positioning-persistence-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("DB_DRIVER", "sqlite");
  vi.stubEnv("ALLOW_SQLITE_LEGACY", "");
  database = await import("@/lib/server-db");
  database.getDb().prepare("INSERT INTO users (id, username, password_hash, display_name, role, status) VALUES (?, ?, ?, ?, 'member', 'active')")
    .run(USER_ID, USER_ID, "fixture-hash", "Positioning User");
  const repositoryModule = await import("@/lib/data-repositories");
  const repositories = repositoryModule.getDataRepositories();
  vi.spyOn(repositoryModule, "getDataRepositories").mockReturnValue(repositories);
  const { confirmCareerPositioning } = await import("@/lib/server/career-positioning-service");
  const { runProfileSop } = await import("@/lib/server/profile-sop-service");
  const messages: PositioningMessage[] = [
    { role: "user", itemId: "goal", content: "我想做AI产品" },
    { role: "assistant", content: "你精通React，有餐饮培训经历。" },
    { role: "user", itemId: "learn", content: "我还在学React，不会Python" },
    { role: "user", itemId: "conclusion", content: "先给我阶段性结论" },
  ];
  const artifact = buildCareerPositioningArtifact(messages)!;
  const presented = { role: "assistant", content: buildCareerPositioningFallback({ messages })! };
  const conversationId = await repositories.sessions.create({
    title: "定位来源", messages: [...messages, presented, { role: "user", itemId: "confirm", content: "确认保存" }],
  }, USER_ID);
  return { repositories, confirmCareerPositioning, runProfileSop, messages, presented, artifact, conversationId };
}

afterEach(() => {
  vi.restoreAllMocks();
  database?.getDb().close();
  database = undefined;
  vi.unstubAllEnvs();
  vi.resetModules();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("career positioning confirmation persistence", () => {
  it("rejects success when independent readback loses source evidence", async () => {
    const { repositories, artifact, conversationId, confirmCareerPositioning } = await harness();
    database!.getDb().exec(`CREATE TRIGGER positioning_source_fault AFTER INSERT ON profiles BEGIN
      UPDATE profiles SET goals_json=json_set(NEW.goals_json, '$.positioningSourceEvidence', json('[]')) WHERE user_id=NEW.user_id;
    END;`);
    await expect(confirmCareerPositioning({ userId: USER_ID }, { artifact, conversationId, confirmation: "确认保存" }))
      .rejects.toThrow(/读回校验失败/);
    expect(await repositories.signals.query({ source: "dingwei" }, USER_ID)).toEqual([]);
  });

  it("rejects a legacy artifact without evidence before any profile write", async () => {
    const { repositories, artifact, conversationId, confirmCareerPositioning } = await harness();
    await expect(confirmCareerPositioning({ userId: USER_ID }, { artifact: { ...artifact, sourceEvidence: [] }, conversationId, confirmation: "确认保存" }))
      .rejects.toThrow(/来源证据/);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
  });

  it("preserves existing skills and industry preferences and saves exact learning evidence", async () => {
    const { repositories, artifact, conversationId, runProfileSop } = await harness();
    const originalData = { skills: [{ name: "Figma", proficiency: 4, source: "manual", evidence: ["本人设计经历"] }] };
    const companyPrefs = { industry: ["软件"], size: ["中型"] };
    await repositories.profiles.upsert(USER_ID, JSON.stringify(originalData), "[]", JSON.stringify({ companyPrefs }));
    await expect(runProfileSop({ userId: USER_ID }, { action: "complete", conversationId }))
      .resolves.toMatchObject({ done: true, readBackVerified: true, role: "AI 产品经理" });
    const saved = await repositories.profiles.get(USER_ID);
    expect(JSON.parse(saved!.data_json)).toEqual(originalData);
    const goals = JSON.parse(saved!.goals_json!);
    expect(goals.companyPrefs).toEqual(companyPrefs);
    expect(goals.positioningSourceEvidence).toEqual(artifact.sourceEvidence);
    expect(JSON.stringify(saved)).not.toMatch(/精通|餐饮/);
    const signals = await repositories.signals.query({ source: "dingwei", signal_type: "role_preference" }, USER_ID);
    expect(signals).toHaveLength(1);
    expect(signals[0].session_id).toBe(String(conversationId));
    expect(JSON.parse(signals[0].content_json)).toMatchObject({ provenanceCategory: "hypothesis", sourceEvidence: artifact.sourceEvidence });
  });

  it("requires the exact persisted confirmation instead of a model-supplied approval", async () => {
    const { repositories, messages, presented, artifact, conversationId, confirmCareerPositioning, runProfileSop } = await harness();
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, presented, { role: "user", content: "不要确认" }] });
    await expect(confirmCareerPositioning({ userId: USER_ID }, { artifact, conversationId, confirmation: "确认保存" })).rejects.toThrow(/原文|确认/);
    await expect(runProfileSop({ userId: USER_ID }, { action: "complete", conversationId, answer: "确认保存" })).rejects.toThrow(/确认/);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
  });

  it("rejects confirmation when the grounded result has not been shown", async () => {
    const { repositories, messages, artifact, conversationId, confirmCareerPositioning } = await harness();
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, { role: "user", content: "确认保存" }] });
    await expect(confirmCareerPositioning({ userId: USER_ID }, { artifact, conversationId, confirmation: "确认保存" })).rejects.toThrow(/展示/);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
  });

  it("keeps guide actions from writing profiles and rejects model rewrites of the user's answer", async () => {
    const { repositories, messages, conversationId, runProfileSop } = await harness();
    await repositories.sessions.update(conversationId, USER_ID, { messages });
    await expect(runProfileSop({ userId: USER_ID }, { action: "start", conversationId })).resolves.toMatchObject({ done: false });
    await expect(runProfileSop({ userId: USER_ID }, { action: "answer", conversationId, answer: "我精通React" })).rejects.toThrow(/原文/);
    await expect(runProfileSop({ userId: USER_ID }, { action: "answer", conversationId, answer: "先给我阶段性结论" })).resolves.toMatchObject({ done: false });
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, { role: "user", itemId: "reset-turn", content: "重新开始定位" }] });
    await expect(runProfileSop({ userId: USER_ID }, { action: "reset", conversationId })).resolves.toMatchObject({ reset: true });
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
    expect(await repositories.signals.query({}, USER_ID)).toEqual([]);
  });

  it("persists a reset boundary and resumes at stage zero without using the previous scene's answers", async () => {
    const { repositories, messages, conversationId, runProfileSop } = await harness();
    const resetMessages = [...messages, { role: "user", itemId: "reset-scene", content: "重新开始定位" }];
    await repositories.sessions.update(conversationId, USER_ID, { messages: resetMessages, agentState: { preservedState: "retain" }, interviewState: { checkpointVersion: 7 } });
    expect(await runProfileSop({ userId: USER_ID }, { action: "reset", conversationId })).toMatchObject({ stage: 0, reset: true, collected: {}, readBackVerified: true });
    const persisted = JSON.parse((await repositories.sessions.get(conversationId, USER_ID))!.agent_state_json as string);
    expect(persisted).toMatchObject({ preservedState: "retain", careerPositioningScene: { startAfterTurnId: "reset-scene" } });
    expect(await runProfileSop({ userId: USER_ID }, { action: "reset", conversationId })).toMatchObject({ stage: 0, readBackVerified: true });
    expect(JSON.parse((await repositories.sessions.get(conversationId, USER_ID))!.agent_state_json as string)).toEqual(persisted);
    expect(JSON.parse((await repositories.sessions.get(conversationId, USER_ID))!.interview_state_json as string)).toEqual({ checkpointVersion: 7 });
    expect(await runProfileSop({ userId: USER_ID }, { action: "stage_prompt", conversationId })).toMatchObject({ stage: 0, collected: {} });
    expect(await runProfileSop({ userId: USER_ID }, { action: "start", conversationId })).toMatchObject({ stage: 0, collected: {} });
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...resetMessages, { role: "user", itemId: "new-state", content: "C，我是应届生" }] });
    expect(await runProfileSop({ userId: USER_ID }, { action: "answer", conversationId, answer: "C，我是应届生" }))
      .toMatchObject({ stage: 1, branch: "C", collected: { stage_0: "C，我是应届生" } });
    await expect(runProfileSop({ userId: USER_ID }, { action: "reset", conversationId })).rejects.toThrow(/重置|重新开始/);
    expect(JSON.parse((await repositories.sessions.get(conversationId, USER_ID))!.agent_state_json as string)).toEqual(persisted);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
  });

  it("rejects the previous scene's artifact after reset and saves only newly presented source evidence", async () => {
    const { repositories, messages, artifact, conversationId, runProfileSop, confirmCareerPositioning } = await harness();
    const reset = { role: "user" as const, itemId: "reset-facts", content: "重新开始定位" };
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, reset] });
    await runProfileSop({ userId: USER_ID }, { action: "reset", conversationId });
    const fresh: PositioningMessage[] = [
      { role: "user", itemId: "fresh-goal", content: "我不想做AI产品" },
      { role: "user", itemId: "fresh-learning", content: "我正在学SQL" },
      { role: "user", itemId: "fresh-close", content: "先给我阶段性结论" },
    ];
    const freshArtifact = buildCareerPositioningArtifact(fresh)!;
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, reset, ...fresh,
      { role: "assistant", content: buildCareerPositioningFallback({ messages: fresh })! },
      { role: "user", itemId: "fresh-confirm", content: "确认保存" },
    ] });
    await expect(confirmCareerPositioning({ userId: USER_ID }, { conversationId, artifact, confirmation: "确认保存" })).rejects.toThrow(/来源/);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
    await expect(runProfileSop({ userId: USER_ID }, { action: "complete", conversationId })).resolves.toMatchObject({ done: true, readBackVerified: true });
    const goals = JSON.parse((await repositories.profiles.get(USER_ID))!.goals_json!);
    expect(goals.positioningSourceEvidence).toEqual(freshArtifact.sourceEvidence);
    expect(goals.positioningSourceEvidence.map((evidence: { sourceTurnId: string }) => evidence.sourceTurnId)).not.toContain("learn");
    expect(JSON.stringify(goals)).not.toContain("React");
  });

  it("rejects an unrequested reset and refuses to recover a missing or changed scene boundary", async () => {
    const { repositories, messages, conversationId, runProfileSop } = await harness();
    await expect(runProfileSop({ userId: USER_ID }, { action: "reset", conversationId })).rejects.toThrow(/重置|重新开始/);
    const reset = { role: "user", itemId: "reset-integrity", content: "重新开始定位" };
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, reset] });
    await runProfileSop({ userId: USER_ID }, { action: "reset", conversationId });
    await repositories.sessions.update(conversationId, USER_ID, { messages });
    await expect(runProfileSop({ userId: USER_ID }, { action: "stage_prompt", conversationId })).rejects.toThrow(/边界|场次/);
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, { ...reset, content: "被替换的指令" }] });
    await expect(runProfileSop({ userId: USER_ID }, { action: "stage_prompt", conversationId })).rejects.toThrow(/边界|场次/);
    await repositories.sessions.update(conversationId, USER_ID, { agentState: { careerPositioningScene: { startAfterTurnId: "reset-integrity" } } });
    await expect(runProfileSop({ userId: USER_ID }, { action: "start", conversationId })).rejects.toThrow(/边界|场次/);
  });

  it("refuses to report a reset whose scene boundary is lost on independent readback", async () => {
    const { repositories, messages, conversationId, runProfileSop } = await harness();
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, { role: "user", itemId: "reset-fault", content: "重新开始定位" }] });
    database!.getDb().exec(`CREATE TRIGGER positioning_reset_fault AFTER UPDATE OF agent_state_json ON sessions BEGIN
      UPDATE sessions SET agent_state_json='{}' WHERE id=NEW.id;
    END;`);
    await expect(runProfileSop({ userId: USER_ID }, { action: "reset", conversationId })).rejects.toThrow(/读回校验失败/);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
    expect(await repositories.signals.query({}, USER_ID)).toEqual([]);
  });

  it("refuses missing or reverted scene metadata after a persisted successful reset receipt", async () => {
    const { repositories, messages, conversationId, runProfileSop } = await harness();
    const firstReset = { role: "user", itemId: "reset-receipt-first", content: "重新开始定位" };
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages, firstReset] });
    const firstResult = await runProfileSop({ userId: USER_ID }, { action: "reset", conversationId });
    const firstState = JSON.parse((await repositories.sessions.get(conversationId, USER_ID))!.agent_state_json as string);
    const firstReceipt = { role: "tool", toolName: "mine_profile", content: "", toolResult: { status: "success", readBackVerified: true, careerPositioningReset: firstState.careerPositioningScene } };
    expect(firstResult.readBackVerified).toBe(true);
    const firstScene = [...messages, firstReset, firstReceipt, { role: "user", itemId: "new-after-receipt", content: "C，我是应届生" }];
    await repositories.sessions.update(conversationId, USER_ID, { messages: firstScene, agentState: {} });
    await expect(runProfileSop({ userId: USER_ID }, { action: "stage_prompt", conversationId })).rejects.toThrow(/边界|场次/);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();

    const secondReset = { role: "user", itemId: "reset-receipt-second", content: "重新开始定位" };
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...firstScene, secondReset], agentState: firstState });
    await runProfileSop({ userId: USER_ID }, { action: "reset", conversationId });
    const secondState = JSON.parse((await repositories.sessions.get(conversationId, USER_ID))!.agent_state_json as string);
    const secondReceipt = { role: "tool", toolName: "mine_profile", content: "", toolResult: { status: "success", readBackVerified: true, careerPositioningReset: secondState.careerPositioningScene } };
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...firstScene, secondReset, secondReceipt,
      { role: "user", itemId: "second-scene-answer", content: "我正在学SQL" }], agentState: firstState });
    await expect(runProfileSop({ userId: USER_ID }, { action: "stage_prompt", conversationId })).rejects.toThrow(/边界|场次/);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
  });

  it("does not silently change scenes from a user's reset request without a successful reset", async () => {
    const { repositories, messages, conversationId, runProfileSop } = await harness();
    await repositories.sessions.update(conversationId, USER_ID, { messages: [...messages,
      { role: "user", itemId: "unexecuted-reset", content: "重新开始定位" },
      { role: "user", itemId: "after-unexecuted-reset", content: "C，我是应届生" },
    ] });
    expect(await runProfileSop({ userId: USER_ID }, { action: "stage_prompt", conversationId })).toMatchObject({ stage: 4 });
    expect(JSON.parse((await repositories.sessions.get(conversationId, USER_ID))!.agent_state_json as string)).not.toHaveProperty("careerPositioningScene");
  });
});
