import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCareerPositioningArtifact, buildCareerPositioningFallback, type PositioningMessage } from "@/lib/agent/career-positioning-result";

const USER_ID = "positioning-source-user";
let directory: string | undefined;
let database: typeof import("@/lib/server-db") | undefined;

async function harness() {
  vi.resetModules();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "positioning-source-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("DB_DRIVER", "sqlite");
  vi.stubEnv("ALLOW_SQLITE_LEGACY", "");
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: async () => ({ userId: USER_ID }) }));
  database = await import("@/lib/server-db");
  database.getDb().prepare("INSERT INTO users (id, username, password_hash, display_name, role, status) VALUES (?, ?, ?, ?, 'member', 'active')")
    .run(USER_ID, USER_ID, "fixture-hash", "Source User");
  const repositories = (await import("@/lib/data-repositories")).getDataRepositories();
  const messages: PositioningMessage[] = [
    { role: "user", itemId: "goal", content: "我想做AI产品" },
    { role: "user", itemId: "learn", content: "我还在学React，不会Python" },
    { role: "user", itemId: "conclusion", content: "先给我阶段性结论" },
  ];
  const conversationId = await repositories.sessions.create({ title: "定位来源", messages: [...messages,
    { role: "assistant", content: buildCareerPositioningFallback({ messages }) },
    { role: "user", itemId: "confirm", content: "确认保存" },
  ] }, USER_ID);
  const { confirmCareerPositioning } = await import("@/lib/server/career-positioning-service");
  return { repositories, messages, conversationId, confirmCareerPositioning };
}

afterEach(() => {
  database?.getDb().close();
  database = undefined;
  vi.doUnmock("@/lib/auth");
  vi.unstubAllEnvs();
  vi.resetModules();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("positioning confirmation source authority", () => {
  it("saves only grounded facts, reads them independently, and does not duplicate a repeated confirmation", async () => {
    const { repositories, messages, conversationId, confirmCareerPositioning } = await harness();
    const artifact = buildCareerPositioningArtifact(messages)!;
    const confirm = () => confirmCareerPositioning({ userId: USER_ID }, { conversationId, artifact, confirmation: "确认保存" });
    await expect(confirm()).resolves.toMatchObject({ role: "AI 产品经理", readBackVerified: true });
    await expect(confirm()).resolves.toMatchObject({ readBackVerified: true });
    const profile = await repositories.profiles.get(USER_ID);
    expect(JSON.parse(profile!.data_json)).toEqual({});
    expect(JSON.parse(profile!.goals_json).positioningSourceEvidence).toContainEqual(expect.objectContaining({
      claim: "React 正在学习", sourceQuote: "我还在学React，不会Python", sourceTurnId: "learn",
    }));
    expect(JSON.parse(profile!.history_json)).toHaveLength(1);
    const signals = await repositories.signals.query({ source: "dingwei", signal_type: "role_preference" }, USER_ID);
    expect(signals).toHaveLength(1);
    expect(JSON.parse(signals[0].content_json)).toMatchObject({ provenanceCategory: "hypothesis", sourceEvidence: artifact.sourceEvidence });
  });

  it("rejects a fabricated mastery claim before writing the profile even when its evidence ID looks valid", async () => {
    const { repositories, messages, conversationId, confirmCareerPositioning } = await harness();
    const artifact = buildCareerPositioningArtifact(messages)!;
    artifact.sourceEvidence.find((evidence) => evidence.topic === "skill:React")!.claim = "自述精通 React";
    await expect(confirmCareerPositioning({ userId: USER_ID }, { conversationId, artifact, confirmation: "确认保存" })).rejects.toThrow(/来源/);
    expect(await repositories.profiles.get(USER_ID)).toBeUndefined();
  });
});
