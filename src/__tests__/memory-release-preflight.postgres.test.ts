import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const root = process.cwd();
const connectionString = process.env.SPEC40_MEMORY_DATABASE_URL;
const identifier = randomUUID().replaceAll("-", "");
const databaseNames = [`spec40_release_${identifier}`, `spec40_restore_${identifier}`];
const ownerId = "release-gate-" + identifier;
let administrative: Pool;
let database: Pool;
let temporaryRoot: string;
let databaseUrl: string;
let backupPath: string;
let restorePath: string;

function invoke(script: string, args: string[] = [], targetUrl = databaseUrl) {
  return spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: temporaryRoot,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      DB_DRIVER: "postgres",
      AGENT_RUNTIME_MODE: "worker_all",
      AGENT_ARTIFACT_DIR: path.join(temporaryRoot, "artifacts"),
      DEEPSEEK_API_KEY: "synthetic-no-model-calls",
      POSTGRES_BACKUP_EVIDENCE: "",
      POSTGRES_RESTORE_EVIDENCE: "",
    },
  });
}

function memoryGate(backup = backupPath, restore = restorePath) {
  return invoke("check-memory-release-gates.mjs", ["--strict", "--backup-evidence", backup, "--restore-evidence", restore]);
}

function report(result: ReturnType<typeof invoke>) {
  expect(result.error).toBeUndefined();
  const start = result.stdout.indexOf("{");
  return JSON.parse(result.stdout.slice(start));
}

describe.skipIf(!connectionString)("memory release and runtime CLI preflight on isolated PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_memory") {
      throw new Error("Release gate regressions require the dedicated local spec40_memory server");
    }
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spec40-release-preflight-"));
    fs.mkdirSync(path.join(temporaryRoot, "build"));
    fs.mkdirSync(path.join(temporaryRoot, "artifacts"));
    fs.writeFileSync(path.join(temporaryRoot, "build", "agent-worker.mjs"), "");
    backupPath = path.join(temporaryRoot, "synthetic-backup.json");
    restorePath = path.join(temporaryRoot, "synthetic-restore.json");
    target.pathname = "/postgres";
    administrative = new Pool({ connectionString: target.toString(), max: 1 });
    for (const name of databaseNames) await administrative.query(`CREATE DATABASE "${name}"`);
    target.pathname = "/" + databaseNames[0];
    databaseUrl = target.toString();
    database = new Pool({ connectionString: databaseUrl, max: 1 });
    await database.query(fs.readFileSync(path.join(root, "src/lib/postgres-schema.sql"), "utf8"));
    await database.query("INSERT INTO users (id,username,password_hash,display_name,status) VALUES ($1,$1,'synthetic','Synthetic release fixture','active')", [ownerId]);
    const erasedText = "Synthetic completed erasure for release verification";
    const erasedHash = createHash("sha256").update(erasedText).digest("hex");
    const erasure = await database.query(`INSERT INTO memory_erasure_requests
      (user_id,target_type,target_id,target_hash,status,scope_json,completed_layers_json,completed_at)
      VALUES ($1,'fact','synthetic-empty-target',$2,'completed',$3::jsonb,
        '{"session":true,"postgres":true}',now()) RETURNING id`, [ownerId, erasedHash,
      JSON.stringify({ factIds: [901], itemIds: [], episodeIds: [], sourceRefs: [], targetKey: null })]);
    const witnesses = path.join(temporaryRoot, "synthetic-witnesses.json");
    fs.writeFileSync(witnesses, JSON.stringify({ format: "zhiyuan-memory-erasure-witnesses-v1", requests: [
      { requestId: Number(erasure.rows[0].id), userId: ownerId, targetHash: erasedHash, canonicalText: erasedText },
    ] }));
    const backup = invoke("backup-postgres.mjs", ["--output", backupPath, "--retention-days", "30", "--retention-verified"]);
    expect(backup.status, backup.stderr).toBe(0);
    target.pathname = "/" + databaseNames[1];
    const restored = invoke("restore-postgres.mjs", ["--input", backupPath, "--schema", path.join(root, "src/lib/postgres-schema.sql"),
      "--apply", "--allow-overwrite", "--evidence", restorePath, "--erasure-witnesses", witnesses], target.toString());
    expect(restored.status, restored.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(restorePath, "utf8"))).toMatchObject({ readBack: true, replayedErasures: 1, sourceBackup: backupPath });
  }, 60_000);

  beforeEach(async () => {
    await database.query(`UPDATE memory_erasure_requests SET status='completed',
      completed_layers_json='{"session":true,"postgres":true}' WHERE user_id=$1`, [ownerId]);
    await database.query("UPDATE memory_runtime_gates SET state='open'");
  });

  afterAll(async () => {
    await database?.end();
    if (administrative) {
      for (const name of databaseNames) await administrative.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await administrative.end();
    }
    if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it("accepts a normally completed erasure without pretending the live database was restored", async () => {
    const before = (await database.query("SELECT * FROM memory_erasure_requests WHERE user_id=$1", [ownerId])).rows;
    expect(before[0].completed_layers_json).toEqual({ session: true, postgres: true });
    const memory = memoryGate();
    expect(report(memory)).toMatchObject({ ok: true, gates: { backupEvidence: { ok: true }, restoreEvidence: { ok: true } } });
    expect(memory.status).toBe(0);
    const runtime = invoke("check-agent-runtime-preflight.mjs");
    expect(report(runtime)).toMatchObject({ ok: true, failures: [] });
    expect(runtime.status).toBe(0);
    expect((await database.query("SELECT * FROM memory_erasure_requests WHERE user_id=$1", [ownerId])).rows).toEqual(before);
  });

  it.each([
    { name: "failed erasure", status: "failed", layers: { session: true, postgres: true } },
    { name: "missing session completion", status: "completed", layers: { postgres: true } },
    { name: "missing PostgreSQL completion", status: "completed", layers: { session: true } },
    { name: "failed session completion", status: "completed", layers: { session: false, postgres: true } },
    { name: "failed PostgreSQL completion", status: "completed", layers: { session: true, postgres: false } },
    { name: "restore marker without session completion", status: "completed", layers: { postgres: true, restoreReplay: true } },
    { name: "restore marker without PostgreSQL completion", status: "completed", layers: { session: true, restoreReplay: true } },
  ])("blocks $name through both CLIs without changing the request", async ({ status, layers }) => {
    await database.query("UPDATE memory_erasure_requests SET status=$2,completed_layers_json=$3::jsonb WHERE user_id=$1",
      [ownerId, status, JSON.stringify(layers)]);
    const before = (await database.query("SELECT * FROM memory_erasure_requests WHERE user_id=$1", [ownerId])).rows;
    const memory = memoryGate();
    expect(report(memory)).toMatchObject({ ok: false, gates: { erasureCompletion: { ok: false } } });
    expect(memory.status).toBe(1);
    const runtime = invoke("check-agent-runtime-preflight.mjs");
    expect(report(runtime)).toMatchObject({ ok: false, failures: ["1 erasure request(s) are failed or lack required layer completion"] });
    expect(runtime.status).toBe(1);
    expect((await database.query("SELECT * FROM memory_erasure_requests WHERE user_id=$1", [ownerId])).rows).toEqual(before);
  });

  it("keeps the release blocked when backup evidence is missing", () => {
    const result = memoryGate(path.join(temporaryRoot, "missing-backup.json"));
    expect(report(result)).toMatchObject({ ok: false, gates: { backupEvidence: { ok: false } } });
    expect(result.status).toBe(1);
  });

  it("keeps the release blocked when restore evidence is missing despite completed live erasures", () => {
    const result = memoryGate(backupPath, path.join(temporaryRoot, "missing-restore.json"));
    expect(report(result)).toMatchObject({ ok: false, gates: { erasureCompletion: { ok: true }, restoreEvidence: { ok: false } } });
    expect(result.status).toBe(1);
  });

  it.each([
    { name: "unverified read-back", changes: { readBack: false } },
    { name: "different backup", changes: { sourceBackup: "different-synthetic-backup.json" } },
    { name: "expired restore evidence", changes: { verifiedAt: "2000-01-01T00:00:00.000Z" } },
    { name: "mismatched backup content hash", changes: { backupSha256: "0".repeat(64) } },
    { name: "missing completed-erasure coverage", changes: { erasures: [] } },
  ])("rejects $name while preserving the valid original restore receipt", ({ changes }) => {
    const original = fs.readFileSync(restorePath, "utf8");
    const alteredPath = path.join(temporaryRoot, "altered-restore.json");
    fs.writeFileSync(alteredPath, JSON.stringify({ ...JSON.parse(original), ...changes }));
    const result = memoryGate(backupPath, alteredPath);
    expect(report(result)).toMatchObject({ ok: false, gates: { restoreEvidence: { ok: false } } });
    expect(result.status).toBe(1);
    expect(fs.readFileSync(restorePath, "utf8")).toBe(original);
  });

  it("keeps the release blocked when backup retention has not been verified", () => {
    const alteredPath = path.join(temporaryRoot, "unverified-retention-backup.json");
    fs.writeFileSync(alteredPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(backupPath, "utf8")), retentionVerified: false }));
    const result = memoryGate(alteredPath);
    expect(report(result)).toMatchObject({ ok: false, gates: { backupEvidence: { ok: false } } });
    expect(result.status).toBe(1);
  });

  it.each(["id", "userId", "targetHash", "readBack"])("rejects a restore receipt with an invalid erasure %s", (field) => {
    const original = fs.readFileSync(restorePath, "utf8");
    const restore = JSON.parse(original);
    restore.erasures[0][field] = field === "readBack" ? false : "different-synthetic-identity";
    const alteredPath = path.join(temporaryRoot, "altered-identity-restore.json");
    fs.writeFileSync(alteredPath, JSON.stringify(restore));
    const result = memoryGate(backupPath, alteredPath);
    expect(report(result)).toMatchObject({ ok: false, gates: { restoreEvidence: { ok: false } } });
    expect(result.status).toBe(1);
    expect(fs.readFileSync(restorePath, "utf8")).toBe(original);
  });

  it("rejects an old restore receipt when the same backup path has new content", () => {
    const original = fs.readFileSync(backupPath, "utf8");
    try {
      fs.writeFileSync(backupPath, original + "\n");
      const result = memoryGate();
      expect(report(result)).toMatchObject({ ok: false, gates: { backupEvidence: { ok: true }, restoreEvidence: { ok: false } } });
      expect(result.status).toBe(1);
    } finally {
      fs.writeFileSync(backupPath, original);
    }
  });

  it("blocks both CLIs while restore leaves a memory runtime gate closed", async () => {
    await database.query("UPDATE memory_runtime_gates SET state='closed',reason='synthetic restore awaiting erasure replay' WHERE gate_name='read'");
    const memory = memoryGate();
    expect(report(memory)).toMatchObject({ ok: false, runtimeGates: { read: { ok: false } } });
    expect(memory.status).toBe(1);
    const runtime = invoke("check-agent-runtime-preflight.mjs");
    expect(report(runtime)).toMatchObject({ ok: false, failures: ["Memory runtime gate read is not open"] });
    expect(runtime.status).toBe(1);
  });
});
