import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ServerDbModule = typeof import("@/lib/server-db");
const TEST_USER_ID = "user-career-positioning-provenance";
let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

async function loadHarness(options: { dropEvidenceOnReadBack?: boolean } = {}) {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-positioning-provenance-"));
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("DB_DRIVER", "sqlite");
  vi.stubEnv("ALLOW_SQLITE_LEGACY", "");
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({ userId: TEST_USER_ID, username: "positioning-user", role: "member", tokenVersion: 0 }),
  }));
  serverDb = await import("@/lib/server-db");
  serverDb.getDb().prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "positioning-user", "hash", "Positioning User", "member", "active");
  const profileRoute = await import("@/app/api/data/profile/route");
  const signalRoute = await import("@/app/api/data/signals/route");
  const { persistCareerPositioningArtifact } = await import("@/components/agent/use-agent-conversation-helpers");
  const { buildCareerPositioningArtifact } = await import("@/lib/agent/career-positioning-result");
  let profileReadCount = 0;
  const routeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(new URL(String(input), "http://localhost"), init);
    if (request.url.endsWith("/api/data/profile")) {
      if (request.method === "PUT") return profileRoute.PUT(request);
      const response = await profileRoute.GET();
      profileReadCount += 1;
      if (options.dropEvidenceOnReadBack && profileReadCount === 2) {
        const json = await response.json();
        json.data.goals.positioningSourceEvidence = [];
        return Response.json(json, { status: response.status });
      }
      return response;
    }
    if (request.url.endsWith("/api/data/signals")) {
      if (request.method === "POST") return signalRoute.POST(request);
      return signalRoute.GET(request);
    }
    throw new Error(`Unexpected request: ${request.url}`);
  });
  vi.stubGlobal("fetch", routeFetch);
  return { profileRoute, signalRoute, persistCareerPositioningArtifact, buildCareerPositioningArtifact, routeFetch };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth");
  if (serverDb) {
    serverDb.getDb().close();
    serverDb = null;
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  if (dataDir) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
});

describe("career positioning confirmation persistence", () => {
  it("does not report verified success when the role survives but its source evidence is missing on readback", async () => {
    const { buildCareerPositioningArtifact, persistCareerPositioningArtifact } = await loadHarness({ dropEvidenceOnReadBack: true });
    const artifact = buildCareerPositioningArtifact([
      { role: "user", content: "我想做AI产品" },
      { role: "user", content: "我在学React" },
      { role: "user", content: "阶段性结论" },
    ])!;
    await expect(persistCareerPositioningArtifact(artifact)).rejects.toThrow(/读回校验失败/);
  });

  it("rejects a legacy positioning result without source evidence before any profile write", async () => {
    const { buildCareerPositioningArtifact, persistCareerPositioningArtifact, routeFetch } = await loadHarness();
    const artifact = buildCareerPositioningArtifact([
      { role: "user", content: "我想做AI产品" },
      { role: "user", content: "我还在学React" },
      { role: "user", content: "阶段性结论" },
    ])!;
    await expect(persistCareerPositioningArtifact({ ...artifact, sourceEvidence: [] })).rejects.toThrow(/来源证据/);
    expect(routeFetch).not.toHaveBeenCalled();
  });

  it("reads back the user's exact learning evidence without changing skills or inventing industry preferences", async () => {
    const { profileRoute, signalRoute, buildCareerPositioningArtifact, persistCareerPositioningArtifact } = await loadHarness();
    const originalData = { skills: [{ name: "Figma", proficiency: 4, source: "manual", evidence: ["本人设计经历"] }] };
    await profileRoute.PUT(new Request("http://localhost/api/data/profile", {
      method: "PUT",
      body: JSON.stringify({ data: originalData, goals: { companyPrefs: { industry: ["软件"], size: ["中型"] } } }),
    }));
    const artifact = buildCareerPositioningArtifact([
      { role: "user", itemId: "goal-turn", content: "我想做AI产品" },
      { role: "assistant", content: "你精通React，有餐饮培训经历。" },
      { role: "user", itemId: "learning-turn", content: "我还在学React，不会Python" },
      { role: "user", itemId: "close-turn", content: "先给我阶段性结论" },
    ])!;

    await expect(persistCareerPositioningArtifact(artifact, 42)).resolves.toEqual({ role: "AI 产品经理", readBackVerified: true });

    const savedProfile = await (await profileRoute.GET()).json();
    expect(savedProfile.data.data).toEqual(originalData);
    expect(savedProfile.data.goals.companyPrefs).toEqual({ industry: ["软件"], size: ["中型"] });
    expect(savedProfile.data.goals.positioningSourceEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "user_stated", claim: "React 正在学习", sourceQuote: "我还在学React，不会Python", sourceTurnId: "learning-turn" }),
      expect.objectContaining({ claim: "Python 尚未掌握", sourceTurnId: "learning-turn" }),
    ]));
    expect(savedProfile.data.goals.targetRoles).toEqual([{ role: "AI 产品经理", level: "待验证" }]);
    expect(JSON.stringify(savedProfile)).not.toMatch(/精通|餐饮/);
    const signals = await (await signalRoute.GET(new Request("http://localhost/api/data/signals"))).json();
    expect(signals.data).toHaveLength(1);
    expect(signals.data[0]).toMatchObject({ source: "dingwei", signal_type: "role_preference", session_id: "42" });
    expect(signals.data[0].content_json).toMatchObject({
      role: "AI 产品经理", provenanceCategory: "hypothesis", status: "confirmed",
      sourceEvidence: expect.arrayContaining([expect.objectContaining({ claim: "React 正在学习", sourceTurnId: "learning-turn" })]),
    });
  });
});
