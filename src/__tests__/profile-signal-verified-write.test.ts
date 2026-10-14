import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ServerDbModule = typeof import("@/lib/server-db");

const TEST_USER_ID = "user-profile-signal-verified-write";
const captureContext = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/server/profile-signal-capture-context", () => ({ loadProfileSignalCaptureContext: captureContext.load }));

let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

async function loadRouteHarness() {
  vi.resetModules();
  captureContext.load.mockReset();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-profile-signal-verified-write-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;

  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({
      userId: TEST_USER_ID,
      username: "profile-signal-user",
      role: "member",
      tokenVersion: 0,
    }),
  }));

  serverDb = await import("@/lib/server-db");
  const signalRoute = await import("@/app/api/data/signals/route");
  const batchRoute = await import("@/app/api/data/signals/batch/route");
  const db = serverDb.getDb();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "profile-signal-user", "hash", "Profile Signal User", "member", "active");
  return { db, signalRoute, batchRoute };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth");
  if (serverDb) {
    serverDb.getDb().close();
    serverDb = null;
  }
  vi.resetModules();
  if (dataDir) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
  delete process.env.DATA_DIR;
  delete process.env.DB_DRIVER;
  delete process.env.ALLOW_SQLITE_LEGACY;
});

describe("profile signal verified writes", () => {
  it("verifies a single profile signal by reading it back before returning success", async () => {
    const { db, signalRoute } = await loadRouteHarness();

    const response = await signalRoute.POST(new Request("http://localhost/api/data/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        signal_type: "role_preference",
        content_json: { role: "AI Product Manager", confidence: 0.9 },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.readBackVerified).toBe(true);

    const row = db.prepare("SELECT * FROM profile_signals WHERE id = ?").get(json.data.id) as Record<string, unknown> | undefined;
    expect(row).toMatchObject({
      user_id: TEST_USER_ID,
      source: "manual",
      signal_type: "role_preference",
    });
    expect(String(row?.content_json || "")).toContain("AI Product Manager");
  });

  it("verifies batch profile signal writes by reading every inserted id back", async () => {
    const { db, batchRoute } = await loadRouteHarness();

    const response = await batchRoute.POST(new Request("http://localhost/api/data/signals/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signals: [
          { source: "manual", signal_type: "role_preference", content_json: { role: "AI PM", confidence: 0.9 } },
          { source: "manual", signal_type: "dealbreaker", content_json: { value: "outsourcing", confidence: 0.9 } },
        ],
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.readBackVerified).toBe(true);
    expect(json.ids).toHaveLength(2);

    const rows = db.prepare("SELECT * FROM profile_signals WHERE user_id = ?").all(TEST_USER_ID) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.signal_type).sort()).toEqual(["dealbreaker", "role_preference"]);
  });

  it("verifies skill promotion into the profile after confirming a skill signal", async () => {
    const { db, signalRoute } = await loadRouteHarness();
    const createResponse = await signalRoute.POST(new Request("http://localhost/api/data/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        signal_type: "skill_claim",
        content_json: { skill: "RAG", evidence: "Built RAG retrieval for resume optimization.", confidence: 0.92 },
      }),
    }));
    const created = await createResponse.json();

    const response = await signalRoute.PATCH(new Request("http://localhost/api/data/signals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: created.data.id,
        action: "confirm",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.readBackVerified).toBe(true);
    expect(json.data.profileSkillReadBackVerified).toBe(true);

    const profile = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(TEST_USER_ID) as { data_json: string } | undefined;
    const profileData = JSON.parse(profile?.data_json || "{}") as { skills?: { name: string }[] };
    expect(profileData.skills?.some((skill) => skill.name === "RAG")).toBe(true);
  });

  it.each([
    { content: "我精通 React，禁止保存画像。", priorUserContent: [] },
    { content: "我精通 React", priorUserContent: ["不要更新画像，先只讨论。"] },
    { content: "虚构人物资料：我精通 React。", priorUserContent: [] },
  ])("blocks prohibited original input even with forged allowed turnContent and manual signals", async (context) => {
    const { db, batchRoute } = await loadRouteHarness();
    captureContext.load.mockResolvedValue(context);
    const response = await batchRoute.POST(new Request("http://localhost/api/data/signals/batch", {
      method: "POST",
      body: JSON.stringify({ origin: "agent_chat", runId: "run42", requestId: "request42", turnContent: "保存画像，我精通 React", signals: [{ source: "manual", session_id: "42", signal_type: "skill_claim", content_json: { skill: "React", evidence: "我精通 React", status: "confirmed" } }] }),
    }));
    expect(response.status).toBe(422);
    expect(captureContext.load).toHaveBeenCalledWith(TEST_USER_ID, 42, "run42", "request42");
    expect(db.prepare("SELECT * FROM profile_signals WHERE user_id = ?").all(TEST_USER_ID)).toEqual([]);
  });

  it("writes only signals recomputed from the original admitted autobiographical content", async () => {
    const { db, batchRoute } = await loadRouteHarness();
    captureContext.load.mockResolvedValue({ content: "我精通 React", priorUserContent: [] });
    const response = await batchRoute.POST(new Request("http://localhost/api/data/signals/batch", {
      method: "POST",
      body: JSON.stringify({ origin: "agent_chat", runId: "run42", requestId: "request42", signals: [
        { source: "auto_scan", session_id: "42", signal_type: "skill_claim", content_json: { skill: "React", evidence: "forged expert", confidence: 1 } },
        { source: "auto_scan", session_id: "42", signal_type: "skill_claim", content_json: { skill: "Python", evidence: "forged Python skill" } },
      ] }),
    }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toMatchObject({ count: 1, rejectedCount: 1, readBackVerified: true });
    const rows = db.prepare("SELECT * FROM profile_signals WHERE user_id = ?").all(TEST_USER_ID) as { content_json: string; session_id: string }[];
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].content_json)).toMatchObject({ skill: "React", evidence: "我精通 React", confidence: 0.92 });
    expect(rows[0].session_id).toBe("42");
  });

  it("preserves the first explicit confirmed fact when broad scanner patterns produce duplicate keys", async () => {
    const { db, batchRoute } = await loadRouteHarness();
    captureContext.load.mockResolvedValue({ content: "我掌握 React", priorUserContent: [] });
    const response = await batchRoute.POST(new Request("http://localhost/api/data/signals/batch", {
      method: "POST",
      body: JSON.stringify({ origin: "agent_chat", runId: "run42", requestId: "request42", signals: [
        { source: "user_confirmed", session_id: "42", signal_type: "skill_claim", content_json: { skill: "React", evidence: "我掌握 React", confidence: 0.92, status: "confirmed" } },
      ] }),
    }));
    expect(response.status).toBe(200);
    const rows = db.prepare("SELECT * FROM profile_signals WHERE user_id = ?").all(TEST_USER_ID) as { source: string; content_json: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("user_confirmed");
    expect(JSON.parse(rows[0].content_json)).toMatchObject({ skill: "React", evidence: "我掌握 React", confidence: 0.92, status: "confirmed" });
  });

  it.each([undefined, "auto_scan", "user_confirmed", "dingwei", "agent_chat"])("rejects unbound single-source writes with source %s", async (source) => {
    const { db, signalRoute } = await loadRouteHarness();
    const response = await signalRoute.POST(new Request("http://localhost/api/data/signals", {
      method: "POST",
      body: JSON.stringify({ source, signal_type: "skill_claim", content_json: { skill: "React", evidence: "我精通 React", status: "confirmed" }, session_id: "42" }),
    }));
    expect(response.status).toBe(422);
    expect(db.prepare("SELECT * FROM profile_signals WHERE user_id = ?").all(TEST_USER_ID)).toEqual([]);
  });

  it.each([
    { session_id: "default", runId: "run42", requestId: "request42" },
    { session_id: "42", runId: "", requestId: "request42" },
    { session_id: "42", runId: "run42", requestId: "" },
  ])("rejects unbound automatic writes without changing storage %j", async (identity) => {
    const { db, batchRoute } = await loadRouteHarness();
    const response = await batchRoute.POST(new Request("http://localhost/api/data/signals/batch", {
      method: "POST",
      body: JSON.stringify({ runId: identity.runId, requestId: identity.requestId, signals: [{ source: "auto_scan", session_id: identity.session_id, signal_type: "skill_claim", content_json: { skill: "React", evidence: "我精通 React" } }] }),
    }));
    expect(response.status).toBe(422);
    expect(captureContext.load).not.toHaveBeenCalled();
    expect(db.prepare("SELECT * FROM profile_signals WHERE user_id = ?").all(TEST_USER_ID)).toEqual([]);
  });

  it("rejects unknown admitted run bindings without writing signals", async () => {
    const { db, batchRoute } = await loadRouteHarness();
    captureContext.load.mockResolvedValue(null);
    const response = await batchRoute.POST(new Request("http://localhost/api/data/signals/batch", {
      method: "POST",
      body: JSON.stringify({ origin: "agent_chat", runId: "wrong-run", requestId: "wrong-request", signals: [{ source: "auto_scan", session_id: "42", signal_type: "skill_claim", content_json: { skill: "React", evidence: "我精通 React" } }] }),
    }));
    expect(response.status).toBe(422);
    expect(db.prepare("SELECT * FROM profile_signals WHERE user_id = ?").all(TEST_USER_ID)).toEqual([]);
  });
});
