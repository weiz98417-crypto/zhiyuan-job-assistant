import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const port = Number(process.argv[2]);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error("A valid isolated port is required");
const directory = path.resolve(".private/spec40/interview");
const fixture = JSON.parse(fs.readFileSync(path.join(directory, "fixture.json"), "utf8"));
const database = new URL(fixture.connectionString);
if (database.hostname !== "127.0.0.1" || database.port !== "55440" || database.pathname !== "/spec40_interview_external") {
  throw new Error("Refusing to launch against another database");
}
const realModel = process.env.SPEC40_INTERVIEW_MODEL_MODE === "real";
const modelEnvironment = realModel
  ? dotenv.parse(fs.readFileSync(path.resolve(".private/spec40/server-model.env"))) : {};
if (realModel && !modelEnvironment.DEEPSEEK_API_KEY?.trim()) throw new Error("Real interview model credentials are not configured");
const environment = {
  ...process.env, ...modelEnvironment, DB_DRIVER: "postgres", DATABASE_URL: fixture.connectionString, JWT_SECRET: fixture.jwtSecret,
  DATA_DIR: path.join(directory, "data"), AGENT_RUNTIME_MODE: "worker_all", ALLOW_SQLITE_LEGACY: "",
  DEEPSEEK_API_KEY: modelEnvironment.DEEPSEEK_API_KEY || "", MIMO_API_KEY: modelEnvironment.MIMO_API_KEY || "", NEXT_TELEMETRY_DISABLED: "1",
  AGENT_WORKER_CONCURRENCY: "1", AGENT_WORKER_ID: "spec40-interview-external-worker",
  AGENT_WORKER_POLL_MS: "100", AGENT_WORKER_ATTEMPT_DEADLINE_MS: realModel ? "240000" : "45000",
};
const evidenceId = process.env.SPEC40_INTERVIEW_EVIDENCE_ID;
if (!evidenceId || !/^[a-zA-Z0-9_-]+$/.test(evidenceId)) throw new Error("A safe interview evidence ID is required");
fs.writeFileSync(path.join(directory, "runtime-" + evidenceId + ".json"), JSON.stringify({
  mode: realModel ? "real" : "keyless", deepseekConfigured: Boolean(environment.DEEPSEEK_API_KEY),
  database: "spec40_interview_external", workerHash: fixture.workerHash,
}, null, 2), { flag: "wx" });
console.log("[spec40-interview] model mode=" + (realModel ? "real" : "keyless") + "; configured=" + Boolean(environment.DEEPSEEK_API_KEY));
const children = [
  spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: fixture.appDirectory, env: environment, stdio: "inherit", windowsHide: true }),
  spawn(process.execPath, [path.join(directory, "worker.mjs")],
    { cwd: fixture.appDirectory, env: environment, stdio: "inherit", windowsHide: true }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, stop);
for (const child of children) {
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; stop(); });
  child.on("exit", (code) => { if (!stopping) { process.exitCode = code || 1; stop(); } });
}
