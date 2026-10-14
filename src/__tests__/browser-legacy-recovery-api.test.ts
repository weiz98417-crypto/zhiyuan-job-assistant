import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

let dataDir: string | null = null;
let serverDb: typeof import("@/lib/server-db") | null = null;
let ownerId = "recovery-owner-A";

async function harness() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-browser-recovery-"));
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("DB_DRIVER", "sqlite");
  vi.stubEnv("ALLOW_SQLITE_LEGACY", "");
  vi.stubEnv("JWT_SECRET", "browser-recovery-isolated-fixture-signing-secret");
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({ userId: ownerId, tokenVersion: 0 }),
    verifyTokenVersion: async () => {
      const user = serverDb!.getDb().prepare("SELECT token_version FROM users WHERE id = ?").get(ownerId) as { token_version: number };
      if (user.token_version !== 0) throw new Error("Token has been revoked");
    },
  }));
  serverDb = await import("@/lib/server-db");
  for (const userId of ["recovery-owner-A", "recovery-owner-B"]) {
    serverDb.getDb().prepare("INSERT INTO users (id, username, password_hash, display_name, role, status) VALUES (?, ?, ?, ?, ?, ?)")
      .run(userId, userId, "fixture-hash", userId, "member", "active");
  }
  const repositories = (await import("@/lib/data-repositories")).getDataRepositories();
  await repositories.cv.upsert("recovery-owner-A", { activeVersion: "v1", versions: { v1: { sections: [{ id: "summary", content: "A_VERIFIED_CV" }] } } });
  await repositories.cv.upsert("recovery-owner-B", { activeVersion: "v1", versions: { v1: { sections: [{ id: "summary", content: "B_CV" }] } } });
  const { POST } = await import("@/app/api/users/me/browser-recovery/route");
  return { POST, repositories };
}

afterEach(() => {
  serverDb?.getDb().close();
  serverDb = null;
  vi.doUnmock("@/lib/auth");
  vi.unstubAllEnvs();
  vi.resetModules();
  ownerId = "recovery-owner-A";
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  dataDir = null;
});

it("attests only a matching canonical CV for the authenticated owner without exposing mismatched content", async () => {
  const { POST } = await harness();
  const contentHash = createHash("sha256").update('{"activeVersion":"v1","versions":{"v1":{"sections":[{"content":"A_VERIFIED_CV","id":"summary"}]}}}').digest("hex");
  const request = () => new Request("http://localhost/api/users/me/browser-recovery", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "preview", contentHash }),
  });
  const preview = await (await POST(request())).json();
  expect(preview.data).toMatchObject({ status: "verified", ownerId: "recovery-owner-A", syncId: "cv:recovery-owner-A:v1", contentHash });
  expect(preview.data.proof).toBeTruthy();
  expect(JSON.stringify(preview)).not.toContain("A_VERIFIED_CV");
  ownerId = "recovery-owner-B";
  const mismatch = await (await POST(request())).json();
  expect(mismatch.data).toEqual({ status: "needs_review" });
  expect(JSON.stringify(mismatch)).not.toContain("A_VERIFIED_CV");
});

it("rejects forged, other-owner and stale recovery proofs without changing either server CV", async () => {
  const { POST, repositories } = await harness();
  const contentHash = createHash("sha256").update('{"activeVersion":"v1","versions":{"v1":{"sections":[{"content":"A_VERIFIED_CV","id":"summary"}]}}}').digest("hex");
  const send = (body: unknown) => POST(new Request("http://localhost/api/users/me/browser-recovery", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const attestation = (await (await send({ operation: "preview", contentHash })).json()).data;
  const aBefore = await repositories.cv.get("recovery-owner-A");
  const bBefore = await repositories.cv.get("recovery-owner-B");
  ownerId = "recovery-owner-B";
  const otherOwner = await send({ operation: "restore", proof: attestation.proof });
  expect(otherOwner.status).toBe(409);
  expect(JSON.stringify(await otherOwner.json())).not.toContain("A_VERIFIED_CV");
  ownerId = "recovery-owner-A";
  expect((await send({ operation: "restore", proof: "forged-proof" })).status).toBe(409);
  expect(await repositories.cv.get("recovery-owner-A")).toEqual(aBefore);
  expect(await repositories.cv.get("recovery-owner-B")).toEqual(bBefore);
  await repositories.cv.upsert(ownerId, { activeVersion: "v2", versions: { v2: { sections: [] } } });
  expect((await send({ operation: "restore", proof: attestation.proof })).status).toBe(409);
});

it("rejects a revoked session before issuing a browser ownership proof", async () => {
  const { POST } = await harness();
  serverDb!.getDb().prepare("UPDATE users SET token_version = 1 WHERE id = ?").run(ownerId);
  const response = await POST(new Request("http://localhost/api/users/me/browser-recovery", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "preview", contentHash: "0".repeat(64) }),
  }));
  expect(response.status).toBe(401);
  expect(await response.json()).not.toHaveProperty("data.proof");
});
