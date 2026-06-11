import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ServerDbModule = typeof import("@/lib/server-db");

const TEST_USER_ID = "user-profile-signal-verified-write";

let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

async function loadRouteHarness() {
  vi.resetModules();
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
});
