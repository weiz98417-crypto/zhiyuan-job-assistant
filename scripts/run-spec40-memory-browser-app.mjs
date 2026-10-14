import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { productionBuildDigest, readMemoryBrowserFixture } from "./lib/spec40-memory-browser-build.mjs";

const port = Number(process.argv[2]);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error("A valid isolated port is required");
const evidenceId = process.env.SPEC40_MEMORY_BROWSER_EVIDENCE_ID;
const fixtureIdentity = process.env.SPEC40_MEMORY_BROWSER_FIXTURE_ID;
if (!evidenceId || !/^[a-zA-Z0-9_-]+$/.test(evidenceId) || !fixtureIdentity || !/^[a-f0-9]+$/.test(fixtureIdentity)) {
  throw new Error("Safe explicit memory evidence and fixture identities are required");
}
const directory = path.resolve(".private/spec40/memory-browser");
const { fixture, manifestSha256 } = readMemoryBrowserFixture(directory, fixtureIdentity);
if (manifestSha256 !== process.env.SPEC40_MEMORY_BROWSER_MANIFEST_SHA256) throw new Error("Memory fixture manifest digest mismatch");
if (productionBuildDigest(fixture.appDirectory) !== fixture.buildHash) throw new Error("Frozen memory production build digest mismatch");
const database = new URL(fixture.connectionString);
if (database.hostname !== "127.0.0.1" || database.port !== "55440" || database.pathname !== "/spec40_memory_browser") {
  throw new Error("Refusing to launch memory browser against another database");
}
const redis = new URL(fixture.redisUrl);
if (redis.hostname !== "127.0.0.1" || redis.port !== "56340" || redis.pathname !== "/0") {
  throw new Error("Refusing to launch memory browser against another Redis");
}
fs.writeFileSync(path.join(directory, "runtime-" + evidenceId + ".json"), JSON.stringify({
  database: "spec40_memory_browser", mode: "production-next-start", fixtureIdentity,
  sourceHash: fixture.sourceHash, buildHash: fixture.buildHash, buildId: fixture.buildId, manifestSha256,
  modelConfigured: false, redis: "127.0.0.1:56340/0", clock: fixture.clock,
}, null, 2), { flag: "wx" });
const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: fixture.appDirectory, windowsHide: true, stdio: "inherit",
  env: { ...process.env, DB_DRIVER: "postgres", DATABASE_URL: fixture.connectionString, JWT_SECRET: fixture.jwtSecret,
    CSRF_SECRET: fixture.jwtSecret, AUTH_RATE_LIMIT_SECRET: fixture.jwtSecret, REDIS_URL: fixture.redisUrl,
    APP_ORIGIN: "http://127.0.0.1:" + port, AUTH_COOKIE_SECURE: "false",
    DATA_DIR: path.join(directory, "data-" + fixtureIdentity), ALLOW_SQLITE_LEGACY: "", DEEPSEEK_API_KEY: "", MIMO_API_KEY: "",
    MEMORY_EMBEDDING_PROVIDER: "disabled", NEXT_TELEMETRY_DISABLED: "1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill("SIGTERM"));
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code || 0; });
