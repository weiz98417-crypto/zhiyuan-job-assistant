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
    expect(buildScript).toContain("createRequire");
    expect(buildScript).toContain("import.meta.url");
    expect(ecosystem).toContain("zhiyuan-web");
    expect(ecosystem).toContain("zhiyuan-agent-worker");
    expect(ecosystem).toContain('args: "start -H 127.0.0.1 -p 3100"');
    expect(ecosystem).toContain('"build", "agent-worker.mjs"');
    expect(ecosystem).toContain("AGENT_ARTIFACT_DIR");
    expect(ecosystem).not.toMatch(/tsx|ts-node/);
    expect(packageJson.scripts["check:agent-runtime"]).toContain("check-agent-runtime-preflight.mjs");
    expect(preflight).toContain("to_regclass");
    expect(preflight).toContain("build/agent-worker.mjs");
    expect(preflight).toContain("fs.constants.W_OK");
    expect(preflight).toContain("agent_conversation_items");
    expect(preflight).toContain("agent_feature_flags");
    expect(preflight).toContain("agent_eval_layer_results");
    expect(release).toContain("current.next");
    expect(release).toContain("npm ci --include=dev");
    expect(release).toContain("replace_pm2_runtime");
    expect(release).toContain('pm2 delete "$process_name"');
    expect(release).toContain("timeout --signal=TERM --kill-after=5s 15s");
    expect(release).toContain('kill -KILL "$process_pid"');
    expect(release).toContain('pm2 start "$APP_ROOT/current/ecosystem.config.cjs" --update-env');
    expect(release).not.toContain("startOrReload");
    expect(release).toContain("http://127.0.0.1:3100/login");
    expect(release).toContain("shared/agent-artifacts");
    expect(rollback).toContain("AGENT_WORKER_PAUSE_CLAIMS=1");
    expect(rollback).toContain("current.next");
    expect(rollback).toContain("replace_pm2_runtime");
    expect(rollback).toContain("timeout --signal=TERM --kill-after=5s 15s");
    expect(rollback).toContain('kill -KILL "$process_pid"');
    expect(rollback).not.toContain("startOrReload");
    expect(rollback).toContain("http://127.0.0.1:3100/login");
    expect(rollback).toContain("shared/agent-artifacts");
    expect(workerEntry).toContain("AgentBackgroundJobWorker");
    expect(workerEntry).toContain("PostgresAgentBackgroundJobStore");
    expect(workerEntry).toContain("AGENT_BACKGROUND_JOB_CONCURRENCY");
  });
});
