import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import pg from "pg";
import { createClient } from "redis";
import { memoryFixtureTextDigest, productionBuildDigest, sourceDigest } from "./lib/spec40-memory-browser-build.mjs";

const connectionString = process.env.SPEC40_MEMORY_BROWSER_DATABASE_URL;
if (!connectionString) throw new Error("SPEC40_MEMORY_BROWSER_DATABASE_URL is required");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_memory_browser") {
  throw new Error("Memory browser fixtures require localhost:55440/spec40_memory_browser");
}
const redisUrl = process.env.SPEC40_MEMORY_BROWSER_REDIS_URL;
if (!redisUrl) throw new Error("SPEC40_MEMORY_BROWSER_REDIS_URL is required");
const redisTarget = new URL(redisUrl);
if (redisTarget.hostname !== "127.0.0.1" || redisTarget.port !== "56340" || redisTarget.pathname !== "/0") {
  throw new Error("Memory browser fixtures require isolated localhost:56340/0 Redis");
}
const redis = createClient({ url: redisUrl, socket: { reconnectStrategy: false } });
redis.on("error", () => {});
await redis.connect();
try { if (await redis.ping() !== "PONG") throw new Error("Isolated Redis readiness failed"); }
finally { await redis.quit(); }
const adminTarget = new URL(target);
adminTarget.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminTarget.toString() });
await admin.connect();
try {
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", ["spec40_memory_browser"]);
  if (!exists.rowCount) await admin.query("CREATE DATABASE spec40_memory_browser");
} finally { await admin.end(); }

const fixtureIdentity = randomBytes(8).toString("hex");
const privateDirectory = path.resolve(".private/spec40/memory-browser");
const appDirectory = path.join(privateDirectory, "app-" + fixtureIdentity);
fs.mkdirSync(appDirectory, { recursive: true });
for (const name of ["src", "public", "lib", "modes", "skills"]) {
  fs.cpSync(path.resolve(name), path.join(appDirectory, name), {
    recursive: true, filter: (source) => !source.includes(path.sep + "__tests__"),
  });
}
for (const name of ["package.json", "tsconfig.json", "next-env.d.ts", "AGENTS.md", "next.config.ts", "postcss.config.mjs"]) {
  if (fs.existsSync(name)) fs.copyFileSync(name, path.join(appDirectory, name));
}
fs.symlinkSync(path.resolve("node_modules"), path.join(appDirectory, "node_modules"), "junction");
const sourceHash = sourceDigest(path.join(appDirectory, "src"));
const password = randomBytes(24).toString("base64url");
const passwordHash = await bcrypt.hash(password, 10);
const jwtSecret = randomBytes(48).toString("base64url");
const createdAt = "2026-10-11T01:00:00.000Z";
const expiresAt = "2026-11-11T02:00:00.000Z";
const clock = { fixture: "2026-10-12T02:00:00.000Z", runtime: "wall-clock", timezone: "Asia/Shanghai" };
const caseIds = ["PG-MEM-001", "PG-MEM-003"];
const users = {};
const client = new pg.Client({ connectionString });
await client.connect();
try {
  if ((await client.query("SELECT current_database() AS name")).rows[0].name !== "spec40_memory_browser") {
    throw new Error("Memory fixture database identity mismatch");
  }
  if (Date.now() >= Date.parse(expiresAt)) throw new Error("Synthetic memory fixture version has expired; seed a new version");
  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  await client.query(fs.readFileSync("src/lib/postgres-schema.sql", "utf8"));
  await client.query("UPDATE memory_runtime_gates SET state='open',reason='isolated synthetic browser fixture',updated_at=NOW() WHERE gate_name IN ('read','write','extract')");
  const gates = await client.query("SELECT gate_name,state FROM memory_runtime_gates ORDER BY gate_name");
  if (gates.rowCount !== 3 || gates.rows.some((gate) => gate.state !== "open")) throw new Error("Synthetic memory fixture gates are not open");
  for (const key of ["correction", "candidate", "unavailable"]) {
    const user = { id: "spec40-memory-browser-" + key + "-" + fixtureIdentity,
      username: "spec40Memory" + key + fixtureIdentity, password, facts: [], candidates: [] };
    users[key] = user;
    await client.query("INSERT INTO users(id,username,password_hash,display_name,role,status) VALUES($1,$2,$3,'Synthetic memory browser','member','active')",
      [user.id, user.username, passwordHash]);
    await client.query("INSERT INTO memory_partitions(user_id,partition,readable_agents,writable_agents) VALUES($1,'core',ARRAY['user','profile'],ARRAY['user','profile']),($1,'private',ARRAY['user','profile'],ARRAY['user','profile'])", [user.id]);
    for (let index = 0; index < 7; index += 1) {
      const canonicalText = index === 0 ? "我只考虑上海的岗位" : "SYNTHETIC_MEMORY_FACT_" + index + "：我希望岗位信息有明确来源";
      const partition = index === 0 ? "core" : "private";
      const predicate = index === 0 ? "profile_preference" : "synthetic_preference_" + index;
      const sourceId = "synthetic-" + key + "-source-" + index + "-" + fixtureIdentity;
      const episode = (await client.query("INSERT INTO memory_episodes(user_id,source_type,source_id,content_json) VALUES($1,'user_explicit_memory',$2,$3::jsonb) RETURNING id",
        [user.id, sourceId, JSON.stringify({ fact: canonicalText, evidence: { quote: canonicalText, directCurrentIntent: true }, fixture: true })])).rows[0];
      const fact = (await client.query("INSERT INTO memory_facts(user_id,partition,subject,predicate,object_json,canonical_text,confidence,importance,source_episode_id,decision,decision_reason) VALUES($1,$2,'job_search',$3,$4::jsonb,$5,1,0.8,$6,'ADD','synthetic fixture baseline') RETURNING id",
        [user.id, partition, predicate, JSON.stringify({ value: canonicalText }), canonicalText, episode.id])).rows[0];
      const decision = (await client.query("INSERT INTO memory_fact_decisions(user_id,idempotency_key,source_episode_id,partition,agent_id,decision,decision_reason,result_fact_id) VALUES($1,$2,$3,$4,'profile','ADD','synthetic fixture baseline',$5) RETURNING id",
        [user.id, "synthetic-browser-seed-" + fact.id, episode.id, partition, fact.id])).rows[0];
      await client.query("UPDATE memory_facts SET decision_id=$2 WHERE id=$1", [fact.id, decision.id]);
      await client.query("UPDATE memory_facts SET created_at=$2,valid_at=$2 WHERE id=$1", [fact.id, createdAt]);
      await client.query("UPDATE memory_episodes SET created_at=$2 WHERE id=$1", [episode.id, createdAt]);
      await client.query("UPDATE memory_fact_decisions SET created_at=$2 WHERE id=$1", [decision.id, createdAt]);
      const stored = (await client.query("SELECT canonical_text FROM memory_facts WHERE id=$1 AND user_id=$2", [fact.id, user.id])).rows[0];
      if (memoryFixtureTextDigest(stored.canonical_text) !== memoryFixtureTextDigest(canonicalText)) throw new Error("Seeded fact source digest mismatch");
      user.facts.push({ id: Number(fact.id), canonicalText, partition, predicate, sourceId,
        semanticId: "MEMORY-" + key + "-FACT-" + index + "-v2", fixtureVersion: 2, ownerAlias: key,
        sourceText: canonicalText, sourceSha256: memoryFixtureTextDigest(canonicalText), createdAt, clock, caseIds });
    }
    for (const [index, canonicalText, sensitivity] of [[0, "我期望30K到40K", "job_sensitive"], [1, "SYNTHETIC_CANDIDATE：我希望每周复盘求职计划", "none"]]) {
      const sourceId = "synthetic-" + key + "-candidate-" + index + "-" + fixtureIdentity;
      const candidate = (await client.query("INSERT INTO memory_admission_candidates(user_id,kind,partition,subject,predicate,object_json,canonical_text,source_type,source_id,evidence_json,sensitivity,expires_at) VALUES($1,'remember_request',$2,'job_search',$3,$4::jsonb,$5,'user_explicit_memory',$6,$7::jsonb,$8,NOW()+INTERVAL '30 days') RETURNING id",
        [user.id, sensitivity === "job_sensitive" ? "private" : "core", index === 0 ? "salary_preference" : "weekly_review", JSON.stringify({ value: canonicalText }), canonicalText, sourceId,
          JSON.stringify({ quote: canonicalText, metadata: { fixture: true, originalEvidence: "SYNTHETIC_ORIGINAL_SOURCE" } }), sensitivity])).rows[0];
      await client.query("UPDATE memory_admission_candidates SET created_at=$2,expires_at=$3 WHERE id=$1", [candidate.id, createdAt, expiresAt]);
      const stored = (await client.query("SELECT evidence_json FROM memory_admission_candidates WHERE id=$1 AND user_id=$2", [candidate.id, user.id])).rows[0];
      if (memoryFixtureTextDigest(stored.evidence_json.quote) !== memoryFixtureTextDigest(canonicalText)) throw new Error("Seeded candidate source digest mismatch");
      user.candidates.push({ id: Number(candidate.id), canonicalText, sourceId, sensitivity,
        semanticId: "MEMORY-" + key + "-CANDIDATE-" + index + "-v2", fixtureVersion: 2, ownerAlias: key,
        sourceText: canonicalText, sourceSha256: memoryFixtureTextDigest(canonicalText), createdAt, expiresAt, clock, caseIds });
    }
  }
} finally { await client.end(); }

const buildLog = path.join(privateDirectory, "build-" + fixtureIdentity + ".log");
const reusedBuildManifest = process.env.SPEC40_MEMORY_BROWSER_FROZEN_BUILD_MANIFEST;
if (reusedBuildManifest) {
  const manifest = JSON.parse(fs.readFileSync(reusedBuildManifest, "utf8"));
  if (path.resolve(manifest.appDirectory) !== process.cwd() || manifest.sourceHash !== sourceHash
    || sourceDigest(path.resolve("src"), true) !== sourceHash
    || productionBuildDigest(process.cwd()) !== manifest.buildHash) {
    throw new Error("Verified root production build does not match the frozen memory source");
  }
  fs.cpSync(path.resolve(".next"), path.join(appDirectory, ".next"), { recursive: true });
  if (productionBuildDigest(appDirectory) !== manifest.buildHash) throw new Error("Copied production build digest mismatch");
  fs.writeFileSync(buildLog, JSON.stringify({ mode: "verified-frozen-build-copy", sourceBuildLog: manifest.buildLog,
    sourceHash, buildHash: manifest.buildHash }), { flag: "wx" });
} else {
const descriptor = fs.openSync(buildLog, "wx");
try {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "build"], {
      cwd: appDirectory, windowsHide: true, stdio: ["ignore", descriptor, descriptor],
      env: { ...process.env, DB_DRIVER: "postgres", DATABASE_URL: connectionString, JWT_SECRET: jwtSecret,
        DEEPSEEK_API_KEY: "", MIMO_API_KEY: "", MEMORY_EMBEDDING_PROVIDER: "disabled", NEXT_TELEMETRY_DISABLED: "1" },
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Isolated production build failed; inspect " + buildLog)));
  });
} finally { fs.closeSync(descriptor); }
}
const buildId = fs.readFileSync(path.join(appDirectory, ".next/BUILD_ID"), "utf8").trim();
const buildHash = productionBuildDigest(appDirectory);
fs.writeFileSync(path.join(privateDirectory, "fixture-" + fixtureIdentity + ".json"), JSON.stringify({
  connectionString, redisUrl, jwtSecret, users, appDirectory, sourceHash, buildHash, buildId, createdAt, clock, caseIds,
  sourceVersion: "spec40-memory-browser-v2", fixtureIdentity,
}, null, 2), { mode: 0o600, flag: "wx" });
fs.writeFileSync(path.join(privateDirectory, "fixture-pointer.json"), JSON.stringify({ fixtureIdentity }));
console.log("Synthetic memory fixture and isolated production build ready; identity=" + fixtureIdentity + "; sourceHash=" + sourceHash + "; buildHash=" + buildHash);
