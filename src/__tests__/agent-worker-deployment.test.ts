import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("Agent Worker production deployment", () => {
  it("builds a standalone Node artifact and runs it beside Web under PM2", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const ecosystem = fs.readFileSync(path.join(ROOT, "ecosystem.config.cjs"), "utf8");
    const buildScript = fs.readFileSync(path.join(ROOT, "scripts", "build-agent-worker.mjs"), "utf8");
    const preflight = fs.readFileSync(path.join(ROOT, "scripts", "check-agent-runtime-preflight.mjs"), "utf8");
    const release = fs.readFileSync(path.join(ROOT, "deploy", "agent-runtime", "release.sh"), "utf8");
    const rollback = fs.readFileSync(path.join(ROOT, "deploy", "agent-runtime", "rollback.sh"), "utf8");
    const workerEntry = fs.readFileSync(path.join(ROOT, "src", "worker", "agent-worker.ts"), "utf8");

    expect(packageJson.scripts["build:worker"]).toContain("build-agent-worker.mjs");
    expect(packageJson.devDependencies.esbuild).toBeTruthy();
    expect(buildScript).toContain("src/worker/agent-worker.ts");
    expect(buildScript).toContain("build/agent-worker.mjs");
    expect(ecosystem).toContain("zhiyuan-web");
    expect(ecosystem).toContain("zhiyuan-agent-worker");
    expect(ecosystem).toContain('"build", "agent-worker.mjs"');
    expect(ecosystem).toContain("AGENT_ARTIFACT_DIR");
    expect(ecosystem).not.toMatch(/tsx|ts-node/);
    expect(packageJson.scripts["check:agent-runtime"]).toContain("check-agent-runtime-preflight.mjs");
    expect(preflight).toContain("to_regclass");
    expect(preflight).toContain("build/agent-worker.mjs");
    expect(preflight).toContain("fs.constants.W_OK");
    expect(release).toContain("current.next");
    expect(release).toContain("startOrReload");
    expect(release).toContain("shared/agent-artifacts");
    expect(rollback).toContain("AGENT_WORKER_PAUSE_CLAIMS=1");
    expect(rollback).toContain("current.next");
    expect(rollback).toContain("shared/agent-artifacts");
    expect(workerEntry).toContain("AgentBackgroundJobWorker");
    expect(workerEntry).toContain("PostgresAgentBackgroundJobStore");
    expect(workerEntry).toContain("AGENT_BACKGROUND_JOB_CONCURRENCY");
  });
});
