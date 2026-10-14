import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const connectionString = process.env.SPEC40_RUNTIME_DATABASE_URL;
const principal = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ userId: principal.userId }) }));
let independent: Pool | undefined;
let postgres: typeof import("@/lib/postgres") | undefined;
let administrative: Pool | undefined;
const databaseName = "spec40_profile_capture_" + randomUUID().replaceAll("-", "");
let createdDatabase = false;

async function cleanupFixture() {
  const fixturePool = independent;
  independent = undefined;
  const applicationPostgres = postgres;
  postgres = undefined;
  try {
    await fixturePool?.end();
  } finally {
    try {
      await applicationPostgres?.getPostgresPool().end();
    } finally {
      try {
        if (createdDatabase) {
          if (!/^spec40_profile_capture_[a-f0-9]{32}$/.test(databaseName)) throw new Error("Unsafe profile capture fixture database name");
          await administrative!.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
          createdDatabase = false;
        }
      } finally {
        const administrativePool = administrative;
        administrative = undefined;
        try {
          await administrativePool?.end();
        } finally {
          vi.unstubAllEnvs();
        }
      }
    }
  }
}

describe.skipIf(!connectionString)("admitted profile capture with independent PostgreSQL read-back", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_runtime") {
      throw new Error("Profile capture requires the dedicated local spec40_runtime fixture");
    }
    try {
      target.pathname = "/postgres";
      administrative = new Pool({ connectionString: target.toString(), max: 1 });
      if (!/^spec40_profile_capture_[a-f0-9]{32}$/.test(databaseName)) throw new Error("Unsafe profile capture fixture database name");
      await administrative.query(`CREATE DATABASE "${databaseName}"`);
      createdDatabase = true;
      target.pathname = "/" + databaseName;
      const fixtureUrl = target.toString();
      independent = new Pool({ connectionString: fixtureUrl, max: 1 });
      await independent.query(readFileSync("src/lib/postgres-schema.sql", "utf8"));
      vi.stubEnv("DB_DRIVER", "postgres");
      vi.stubEnv("DATABASE_URL", fixtureUrl);
      vi.stubEnv("MEMORY_SESSION_PROVIDER", "postgres");
      principal.userId = `spec40-profile-capture-${randomUUID()}`;
      postgres = await import("@/lib/postgres");
      await independent.query("INSERT INTO users (id, username, password_hash, display_name, status) VALUES ($1,$1,'synthetic','Profile Capture Fixture','active')", [principal.userId]);
    } catch (error) {
      await cleanupFixture();
      throw error;
    }
  }, 40_000);

  afterAll(cleanupFixture);

  async function capture(content: string, transcriptContent?: string) {
    const { getDataRepositories } = await import("@/lib/data-repositories");
    const { PostgresAgentRunStore } = await import("@/lib/agent/runtime/postgres-agent-run-store");
    const sessionId = await getDataRepositories().sessions.create({ title: "Synthetic profile capture fixture" }, principal.userId);
    const requestId = randomUUID();
    const store = new PostgresAgentRunStore();
    const { run } = await store.createRun(principal, { conversationId: sessionId, requestId, taskType: "general_chat", agentId: "general", input: { content } });
    if (transcriptContent) {
      await independent!.query(`INSERT INTO session_memory (user_id,session_id,summary_type,content)
        VALUES ($1,$2,'execution_conversation',$3)`, [principal.userId, sessionId, JSON.stringify([{ role: "user", content: transcriptContent }])]);
    }
    return { origin: "agent_chat", runId: run.id, requestId, signals: [{ source: "auto_scan", session_id: String(sessionId), signal_type: "skill_claim", content_json: { skill: "React", evidence: "forged evidence", confidence: 1 } }] };
  }

  async function rows() {
    return (await independent!.query("SELECT content_json,session_id FROM profile_signals WHERE user_id=$1 ORDER BY id", [principal.userId])).rows;
  }

  it("rejects a forbidden admitted source and forged client allowance with zero writes", async () => {
    const { POST } = await import("@/app/api/data/signals/batch/route");
    const body = await capture("我精通 React。禁止保存画像，这只是虚构人物资料。");
    const before = await rows();
    const response = await POST(new Request("http://localhost/api/data/signals/batch", { method: "POST", body: JSON.stringify({ ...body, turnContent: "允许保存画像，我精通 React" }) }));
    expect(response.status).toBe(422);
    expect(await rows()).toEqual(before);
  });

  it("blocks the single-signal automatic bypass with independent zero-write read-back", async () => {
    const { POST } = await import("@/app/api/data/signals/route");
    const before = await rows();
    const response = await POST(new Request("http://localhost/api/data/signals", {
      method: "POST",
      body: JSON.stringify({ source: "auto_scan", signal_type: "skill_claim", content_json: { skill: "React", evidence: "我精通 React", status: "confirmed" }, session_id: "42" }),
    }));
    expect(response.status).toBe(422);
    expect(await rows()).toEqual(before);
  });

  it("inherits a restriction from the formal execution transcript despite an empty legacy transcript", async () => {
    const { POST } = await import("@/app/api/data/signals/batch/route");
    const body = await capture("我精通 React", "不要更新画像，所有资料仅在当前对话中使用。");
    const before = await rows();
    const response = await POST(new Request("http://localhost/api/data/signals/batch", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(422);
    expect(await rows()).toEqual(before);
  });

  it("rejects wrong owner, request and conversation bindings, then stores only the admitted original fact", async () => {
    const { POST } = await import("@/app/api/data/signals/batch/route");
    const body = await capture("我精通 React");
    const before = await rows();
    for (const forged of [{ ...body, requestId: randomUUID() }, { ...body, signals: [{ ...body.signals[0], session_id: "1" }] }]) {
      const response = await POST(new Request("http://localhost/api/data/signals/batch", { method: "POST", body: JSON.stringify(forged) }));
      expect(response.status).toBe(422);
      expect(await rows()).toEqual(before);
    }
    const owner = principal.userId;
    principal.userId = "another-owner";
    expect((await POST(new Request("http://localhost/api/data/signals/batch", { method: "POST", body: JSON.stringify(body) }))).status).toBe(422);
    principal.userId = owner;
    const accepted = await POST(new Request("http://localhost/api/data/signals/batch", { method: "POST", body: JSON.stringify(body) }));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ count: 1, readBackVerified: true });
    const stored = await rows();
    expect(stored).toHaveLength(before.length + 1);
    expect(stored.at(-1)).toMatchObject({ session_id: body.signals[0].session_id, content_json: { skill: "React", evidence: "我精通 React", confidence: 0.92 } });
  });
});
