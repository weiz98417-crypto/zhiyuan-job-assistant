import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { buildCareerPositioningArtifact, buildCareerPositioningFallback, type PositioningMessage } from "@/lib/agent/career-positioning-result";

const fixtureUrl = process.env.POSITIONING_POSTGRES_TEST_URL;
const userId = `spec40-positioning-${randomUUID()}`;
let independent: Pool | undefined;
let postgres: typeof import("@/lib/postgres") | undefined;

describe.skipIf(!fixtureUrl)("positioning source confirmation on isolated PostgreSQL", () => {
  beforeAll(async () => {
    const parsed = new URL(fixtureUrl!);
    if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55440" || parsed.pathname !== "/spec40_positioning") {
      throw new Error("Positioning fixture must use the dedicated local spec40_positioning database");
    }
    vi.stubEnv("DB_DRIVER", "postgres");
    vi.stubEnv("DATABASE_URL", fixtureUrl!);
    vi.stubEnv("MEMORY_SESSION_PROVIDER", "postgres");
    independent = new Pool({ connectionString: fixtureUrl, max: 1 });
    postgres = await import("@/lib/postgres");
    await independent.query("INSERT INTO users (id, username, password_hash, display_name, role, status) VALUES ($1,$1,'fixture-hash','Synthetic Positioning User','member','active')", [userId]);
    await independent.query("INSERT INTO memory_runtime_gates (gate_name,state,reason) VALUES ('read','open','isolated positioning fixture'),('write','open','isolated positioning fixture') ON CONFLICT (gate_name) DO UPDATE SET state='open',reason=EXCLUDED.reason");
  });

  afterAll(async () => {
    if (independent) {
      await independent.query("DELETE FROM profile_signals WHERE user_id=$1", [userId]);
      await independent.query("DELETE FROM profiles WHERE user_id=$1", [userId]);
      await independent.query("DELETE FROM session_memory WHERE user_id=$1", [userId]);
      await independent.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      await independent.query("DELETE FROM users WHERE id=$1", [userId]);
      await independent.end();
    }
    await postgres?.getPostgresPool().end();
    vi.unstubAllEnvs();
  });

  it("verifies durable user sources, rejects fabrication and wrong owners, and independently reads the saved result", async () => {
    const { getDataRepositories } = await import("@/lib/data-repositories");
    const { saveExecutionConversation, loadExecutionConversation } = await import("@/lib/agent/runtime/execution-session-service");
    const { confirmCareerPositioning } = await import("@/lib/server/career-positioning-service");
    const { runProfileSop } = await import("@/lib/server/profile-sop-service");
    const repositories = getDataRepositories();
    const principal = { userId };
    const messages: PositioningMessage[] = [
      { role: "user", itemId: "goal", content: "我想做AI产品" },
      { role: "user", itemId: "learn", content: "我还在学React，不会Python" },
      { role: "user", itemId: "conclusion", content: "先给我阶段性结论" },
    ];
    const artifact = buildCareerPositioningArtifact(messages)!;
    const conversationId = await repositories.sessions.create({ title: "Synthetic positioning source fixture" }, userId);
    await saveExecutionConversation(principal, conversationId, messages.map((message) => ({ ...message, id: message.itemId })));
    await runProfileSop(principal, { action: "answer", conversationId, answer: "先给我阶段性结论" });
    expect((await independent!.query("SELECT count(*)::int AS count FROM profiles WHERE user_id=$1", [userId])).rows[0].count).toBe(0);

    const confirmed = [...messages,
      { role: "assistant", itemId: "result", content: buildCareerPositioningFallback({ messages })! },
      { role: "user", itemId: "confirmation", content: "确认保存" },
    ];
    await saveExecutionConversation(principal, conversationId, confirmed.map((message) => ({ ...message, id: message.itemId })));
    await repositories.sessions.update(conversationId, userId, { messages: [{ role: "user", content: "我精通React，拥有餐饮培训经历" }] });
    const loaded = await loadExecutionConversation(principal, conversationId);
    expect(loaded.find((message) => message.id === "learn")?.content).toBe("我还在学React，不会Python");
    const forged = structuredClone(artifact);
    forged.sourceEvidence.find((evidence) => evidence.topic === "skill:React")!.claim = "自述精通 React";
    await expect(confirmCareerPositioning(principal, { conversationId, artifact: forged, confirmation: "确认保存" })).rejects.toThrow(/来源/);
    await expect(confirmCareerPositioning({ userId: `${userId}-other` }, { conversationId, artifact, confirmation: "确认保存" })).rejects.toThrow(/不属于/);
    expect((await independent!.query("SELECT count(*)::int AS count FROM profiles WHERE user_id=$1", [userId])).rows[0].count).toBe(0);

    await expect(runProfileSop(principal, { action: "complete", conversationId })).resolves.toMatchObject({ done: true, readBackVerified: true });
    await expect(runProfileSop(principal, { action: "complete", conversationId })).resolves.toMatchObject({ done: true, readBackVerified: true });
    const stored = (await independent!.query("SELECT data_json,goals_json,history_json FROM profiles WHERE user_id=$1", [userId])).rows[0];
    expect(stored.data_json).toEqual({});
    expect(stored.goals_json.positioningSourceEvidence).toEqual(artifact.sourceEvidence);
    expect(stored.history_json).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toMatch(/精通|餐饮/);
    const signals = (await independent!.query("SELECT content_json,session_id FROM profile_signals WHERE user_id=$1", [userId])).rows;
    expect(signals).toHaveLength(1);
    expect(String(signals[0].session_id)).toBe(String(conversationId));
    expect(signals[0].content_json.sourceEvidence).toEqual(artifact.sourceEvidence);

    const reset = { role: "user" as const, itemId: "reset-positioning", content: "重新开始定位" };
    await saveExecutionConversation(principal, conversationId, [...confirmed, reset].map((message) => ({ ...message, id: message.itemId })));
    await repositories.sessions.update(conversationId, userId, { agentState: { preservedState: "fixture-preserved" } });
    await expect(runProfileSop(principal, { action: "reset", conversationId })).resolves.toMatchObject({ stage: 0, readBackVerified: true });
    const sceneRow = (await independent!.query("SELECT agent_state_json FROM sessions WHERE id=$1 AND user_id=$2", [conversationId, userId])).rows[0];
    expect(sceneRow.agent_state_json).toMatchObject({ preservedState: "fixture-preserved", careerPositioningScene: { startAfterTurnId: "reset-positioning", startAfterContent: "重新开始定位" } });
    await expect(runProfileSop(principal, { action: "stage_prompt", conversationId })).resolves.toMatchObject({ stage: 0, collected: {} });
    const fresh: PositioningMessage[] = [
      { role: "user", itemId: "fresh-goal", content: "我不想做AI产品" },
      { role: "user", itemId: "fresh-learn", content: "我正在学SQL" },
      { role: "user", itemId: "fresh-close", content: "先给我阶段性结论" },
    ];
    const freshArtifact = buildCareerPositioningArtifact(fresh)!;
    const resetReceipt = { role: "tool", itemId: "reset-receipt", toolName: "mine_profile", content: "",
      toolResult: { status: "success", readBackVerified: true, careerPositioningReset: sceneRow.agent_state_json.careerPositioningScene } };
    await saveExecutionConversation(principal, conversationId, [...confirmed, reset, resetReceipt, ...fresh,
      { role: "assistant", itemId: "fresh-result", content: buildCareerPositioningFallback({ messages: fresh })! },
      { role: "user", itemId: "fresh-confirm", content: "确认保存" },
    ].map((message) => ({ ...message, id: message.itemId })));
    await independent!.query("UPDATE sessions SET agent_state_json='{}'::jsonb WHERE id=$1 AND user_id=$2", [conversationId, userId]);
    await expect(runProfileSop(principal, { action: "stage_prompt", conversationId })).rejects.toThrow(/边界|场次/);
    await expect(confirmCareerPositioning(principal, { conversationId, artifact: freshArtifact, confirmation: "确认保存" })).rejects.toThrow(/边界|场次/);
    await repositories.sessions.update(conversationId, userId, { agentState: sceneRow.agent_state_json });
    await expect(confirmCareerPositioning(principal, { conversationId, artifact, confirmation: "确认保存" })).rejects.toThrow(/来源/);
    await expect(runProfileSop(principal, { action: "reset", conversationId })).rejects.toThrow(/重置|重新开始/);
    await expect(runProfileSop(principal, { action: "complete", conversationId })).resolves.toMatchObject({ done: true, readBackVerified: true });
    const freshStored = (await independent!.query("SELECT goals_json,history_json FROM profiles WHERE user_id=$1", [userId])).rows[0];
    expect(freshStored.goals_json.positioningSourceEvidence).toEqual(freshArtifact.sourceEvidence);
    expect(JSON.stringify(freshStored.goals_json)).not.toContain("React");
    expect(freshStored.history_json).toHaveLength(2);
    const freshSignals = (await independent!.query("SELECT content_json FROM profile_signals WHERE user_id=$1", [userId])).rows;
    expect(freshSignals).toHaveLength(2);
    expect(freshSignals.map((row) => row.content_json.sourceEvidence)).toContainEqual(freshArtifact.sourceEvidence);
  });
});
