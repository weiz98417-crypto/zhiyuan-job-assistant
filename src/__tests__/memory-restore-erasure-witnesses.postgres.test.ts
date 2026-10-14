import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const connectionString = process.env.SPEC40_MEMORY_DATABASE_URL;
const run = promisify(execFile);
const text = "Synthetic erased restore fact";
const hash = createHash("sha256").update(text).digest("hex");
const owner = "restore-witness-owner";
const otherOwner = "restore-witness-other-owner";
const requestId = 51;
let administrative: Pool;
let database: Pool;
let targetUrl: string;
let databaseName: string;
let directory: string;
let backupPath: string;
let evidencePath: string;
let witnessesPath: string;

describe.skipIf(!connectionString)("restore witness actual CLI and independent PostgreSQL read-back", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_memory") {
      throw new Error("Restore witness regressions require the dedicated local spec40_memory fixture");
    }
    target.pathname = "/postgres";
    administrative = new Pool({ connectionString: target.toString() });
    databaseName = "spec40_restore_witness_" + randomUUID().replaceAll("-", "");
    await administrative.query('CREATE DATABASE "' + databaseName + '"');
    target.pathname = "/" + databaseName;
    targetUrl = target.toString();
    database = new Pool({ connectionString: targetUrl });
    await database.query(readFileSync("src/lib/postgres-schema.sql", "utf8"));
    await database.query("CREATE TABLE memory_messages_1 (id text PRIMARY KEY, metadata jsonb NOT NULL, embedding vector(1))");
    await database.query("CREATE TABLE restore_json_fixture (id bigint PRIMARY KEY, top_array jsonb, nested_object jsonb, scalar json, text_values text[])");
    directory = mkdtempSync(path.join(tmpdir(), "spec40-restore-witness-"));
    backupPath = path.join(directory, "backup.json");
    evidencePath = path.join(directory, "restore.json");
    witnessesPath = path.join(directory, "witnesses.json");
  }, 40_000);

  beforeEach(async () => {
    rmSync(evidencePath, { force: true });
    writeFileSync(witnessesPath, JSON.stringify({ format: "zhiyuan-memory-erasure-witnesses-v1", requests: [
      { requestId, userId: owner, targetHash: hash, canonicalText: text },
    ] }));
    const timestamp = new Date().toISOString();
    const tables = [
      { name: "users", rows: [owner, otherOwner].map(userId => ({ id: userId, username: userId, password_hash: "synthetic", display_name: "Synthetic restore fixture", status: "active" })) },
      { name: "memory_erasure_requests", rows: [{ id: requestId, user_id: owner, target_type: "fact", target_id: "5001", target_hash: hash,
        status: "completed", scope_json: { factIds: [5001], itemIds: [], episodeIds: [51], sourceRefs: [{ sourceType: "user_explicit_memory", sourceId: "synthetic-source" }], targetKey: null },
        completed_layers_json: { session: true, postgres: true }, completed_at: timestamp }] },
      { name: "memory_episodes", rows: [{ id: 51, user_id: owner, source_type: "user_explicit_memory", source_id: "synthetic-source", content_json: { note: "[已清除]", keep: "retained unrelated memory" } }] },
      { name: "memory_facts", rows: [{ id: 5002, user_id: owner, partition: "core", subject: "synthetic", predicate: "unrelated",
        object_json: ["allowed", { nested: [1, true] }], canonical_text: "retained unrelated fact", source_episode_id: 51 }] },
      { name: "memory_entities", rows: [owner, otherOwner].map((userId, index) => ({ id: 61 + index, user_id: userId, partition: "core", entity_key: "synthetic-entity", summary: "prefixed " + text + " suffix" })) },
      { name: "profile_blocks", rows: [{ id: 71, user_id: owner, topic: "synthetic", sub_topic: "summary", value_json: { memory: text, keep: "retained unrelated memory" } }] },
      { name: "session_memory", rows: [{ id: 81, user_id: owner, session_id: 1, summary_type: "execution_conversation", content: JSON.stringify([{ role: "user", content: text }, { role: "user", content: "retained unrelated memory" }]) }] },
      { name: "mastra_threads", rows: [owner, otherOwner].map(userId => ({ id: "thread-" + userId, resourceId: userId, title: "Synthetic restored thread", createdAt: timestamp, updatedAt: timestamp })) },
      { name: "mastra_messages", rows: [owner, otherOwner].map(userId => ({ id: "message-" + userId, thread_id: "thread-" + userId, resourceId: userId, content: text, role: "user", type: "v2", createdAt: timestamp })) },
      { name: "memory_messages_1", rows: [owner, otherOwner].map(userId => ({ id: "vector-" + userId, metadata: { resource_id: userId, thread_id: "thread-" + userId, message_id: "message-" + userId, content: text }, embedding: "[0.1]" })) },
      { name: "restore_json_fixture", rows: [{ id: 91, top_array: ["alpha", { nested: ["beta"] }], nested_object: { array: [1, true, null], text: "quoted \"data\"" }, scalar: "json scalar", text_values: ["alpha", "comma,value", "quote\"value"] }] },
    ].map(table => ({ ...table, rowCount: table.rows.length }));
    writeFileSync(backupPath, JSON.stringify({ format: "zhiyuan-postgres-json-backup-v1", createdAt: timestamp, tables }));
    const names = (await database.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'memory_runtime_gates'")).rows.map(row => '"' + row.table_name + '"');
    await database.query("TRUNCATE " + names.join(", ") + " RESTART IDENTITY CASCADE");
    await database.query("UPDATE memory_runtime_gates SET state='open'");
  });

  afterAll(async () => {
    await database?.end();
    if (administrative && databaseName) {
      await administrative.query('DROP DATABASE "' + databaseName + '"');
      await administrative.end();
    }
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  async function restore(extra: string[] = []) {
    return run(process.execPath, ["scripts/restore-postgres.mjs", "--database-url", targetUrl, "--input", backupPath,
      "--apply", "--evidence", evidencePath, ...extra], { cwd: process.cwd(), timeout: 40_000 });
  }

  it.each(["scoped", "empty"])("fails closed by default with a %s scope when an erased target is absent", async scope => {
    if (scope === "empty") {
      const backup = JSON.parse(readFileSync(backupPath, "utf8"));
      backup.tables.find((table: { name: string }) => table.name === "memory_erasure_requests").rows[0].scope_json = {};
      writeFileSync(backupPath, JSON.stringify(backup));
    }
    await expect(restore()).rejects.toThrow(/cannot recover target text/);
    expect((await database.query("SELECT state FROM memory_runtime_gates")).rows.every(row => row.state === "closed")).toBe(true);
    expect((await database.query("SELECT completed_layers_json FROM memory_erasure_requests WHERE id=$1", [requestId])).rows[0].completed_layers_json.restoreReplay).toBeUndefined();
    expect(() => readFileSync(evidencePath)).toThrow();
  }, 40_000);

  it("preserves an existing verified receipt and database on a repeated output path", async () => {
    await restore(["--erasure-witnesses", witnessesPath]);
    const receipt = readFileSync(evidencePath, "utf8");
    const before = (await database.query("SELECT * FROM memory_erasure_requests")).rows;
    await expect(restore(["--erasure-witnesses", witnessesPath])).rejects.toThrow(/already exists/);
    expect(readFileSync(evidencePath, "utf8")).toBe(receipt);
    expect((await database.query("SELECT * FROM memory_erasure_requests")).rows).toEqual(before);
  }, 40_000);

  it("binds the recovery receipt to the actual loaded bytes when the backup path changes during restore", async () => {
    const original = readFileSync(backupPath);
    const originalHash = createHash("sha256").update(original).digest("hex");
    const changed = JSON.parse(original.toString("utf8"));
    changed.createdAt = "2020-01-01T00:00:00.000Z";
    let replaced = false;
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/restore-postgres.mjs", "--database-url", targetUrl, "--input", backupPath,
        "--apply", "--evidence", evidencePath, "--erasure-witnesses", witnessesPath], { cwd: process.cwd() });
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        if (!replaced && chunk.toString().includes("Backup:")) {
          writeFileSync(backupPath, JSON.stringify(changed));
          replaced = true;
        }
      });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", code => resolve({ code, stderr }));
    });
    expect(result.code, result.stderr).toBe(0);
    expect(replaced).toBe(true);
    expect(JSON.parse(readFileSync(evidencePath, "utf8")).backupSha256).toBe(originalHash);
    expect(createHash("sha256").update(readFileSync(backupPath)).digest("hex")).not.toBe(originalHash);
  }, 40_000);

  it("keeps reads closed and emits no receipt or replay marker when a derived store fails read-back", async () => {
    await database.query("CREATE FUNCTION refuse_erasure_update() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN OLD; END'");
    await database.query("CREATE TRIGGER refuse_erasure_update BEFORE UPDATE ON memory_entities FOR EACH ROW EXECUTE FUNCTION refuse_erasure_update()");
    try {
      await expect(restore(["--erasure-witnesses", witnessesPath])).rejects.toThrow(/read-back found derived memory/);
      expect((await database.query("SELECT state FROM memory_runtime_gates")).rows.every(row => row.state === "closed")).toBe(true);
      expect((await database.query("SELECT completed_layers_json FROM memory_erasure_requests WHERE id=$1", [requestId])).rows[0].completed_layers_json.restoreReplay).toBeUndefined();
      expect(() => readFileSync(evidencePath)).toThrow();
    } finally {
      await database.query("DROP TRIGGER refuse_erasure_update ON memory_entities");
      await database.query("DROP FUNCTION refuse_erasure_update()");
    }
  }, 40_000);

  it("replays and verifies embedded derived copies with a hash-bound witness without persisting its text", async () => {
    await restore(["--erasure-witnesses", witnessesPath]);
    expect((await database.query("SELECT summary FROM memory_entities WHERE user_id=$1", [owner])).rows[0].summary).not.toContain(text);
    expect((await database.query("SELECT summary FROM memory_entities WHERE user_id=$1", [otherOwner])).rows[0].summary).toContain(text);
    expect((await database.query("SELECT value_json FROM profile_blocks WHERE user_id=$1", [owner])).rows[0].value_json).toEqual({ memory: "[已清除]", keep: "retained unrelated memory" });
    expect((await database.query("SELECT content FROM session_memory WHERE user_id=$1", [owner])).rows[0].content).not.toContain(text);
    expect((await database.query("SELECT content_json FROM memory_episodes WHERE id=51")).rows[0].content_json.keep).toBe("retained unrelated memory");
    expect((await database.query('SELECT id FROM mastra_messages WHERE "resourceId"=$1', [owner])).rows).toEqual([]);
    expect((await database.query('SELECT content FROM mastra_messages WHERE "resourceId"=$1', [otherOwner])).rows[0].content).toBe(text);
    expect((await database.query("SELECT id FROM memory_messages_1 WHERE metadata->>'resource_id'=$1", [owner])).rows).toEqual([]);
    expect((await database.query("SELECT metadata FROM memory_messages_1 WHERE metadata->>'resource_id'=$1", [otherOwner])).rows[0].metadata.content).toBe(text);
    expect((await database.query("SELECT id,object_json FROM memory_facts WHERE user_id=$1", [owner])).rows).toEqual([
      { id: "5002", object_json: ["allowed", { nested: [1, true] }] },
    ]);
    expect((await database.query("SELECT state FROM memory_runtime_gates")).rows.every(row => row.state === "open")).toBe(true);
    expect((await database.query("SELECT completed_layers_json FROM memory_erasure_requests WHERE id=$1", [requestId])).rows[0].completed_layers_json.restoreReplay).toBe(true);
    const evidenceRaw = readFileSync(evidencePath, "utf8");
    const evidence = JSON.parse(evidenceRaw);
    expect(evidence.backupSha256).toBe(createHash("sha256").update(readFileSync(backupPath)).digest("hex"));
    expect(evidence.replayedErasures).toBe(1);
    expect(evidence.erasures).toMatchObject([{ id: requestId, userId: owner, targetHash: hash, witnessUsed: true, readBack: true }]);
    expect(evidenceRaw).not.toContain(text);
    expect((await database.query("SELECT top_array,nested_object,scalar,text_values FROM restore_json_fixture WHERE id=91")).rows[0]).toEqual({
      top_array: ["alpha", { nested: ["beta"] }], nested_object: { array: [1, true, null], text: "quoted \"data\"" },
      scalar: "json scalar", text_values: ["alpha", "comma,value", "quote\"value"],
    });
  }, 40_000);

  it.each(["owner", "hash", "extra"])("rejects a %s witness mismatch before writing the target database", async mismatch => {
    const requests = [{ requestId, userId: owner, targetHash: hash, canonicalText: text }];
    if (mismatch === "owner") requests[0].userId = otherOwner;
    if (mismatch === "hash") requests[0].canonicalText = "unrelated text";
    if (mismatch === "extra") requests.push({ ...requests[0], requestId: 999 });
    writeFileSync(witnessesPath, JSON.stringify({ format: "zhiyuan-memory-erasure-witnesses-v1", requests }));
    await expect(restore(["--erasure-witnesses", witnessesPath])).rejects.toThrow(/witness/);
    expect((await database.query("SELECT COUNT(*)::int AS count FROM users")).rows[0].count).toBe(0);
    expect((await database.query("SELECT state FROM memory_runtime_gates")).rows.every(row => row.state === "open")).toBe(true);
    expect(() => readFileSync(evidencePath)).toThrow();
  }, 40_000);
});
