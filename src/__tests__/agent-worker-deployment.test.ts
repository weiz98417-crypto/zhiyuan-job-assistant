import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("Agent Worker production deployment", () => {
  it("builds a standalone Node artifact and runs it beside Web under PM2", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const ecosystem = fs.readFileSync(path.join(ROOT, "ecosystem.config.cjs"), "utf8");
    const buildScript = fs.readFileSync(path.join(ROOT, "scripts", "build-agent-worker.mjs"), "utf8");
    const preflight = fs.readFileSync(path.join(ROOT, "scripts", "check-agent-runtime-preflight.mjs"), "utf8");
    const backup = fs.readFileSync(path.join(ROOT, "scripts", "backup-postgres.mjs"), "utf8");
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
    expect(preflight).toContain("DEEPSEEK_API_KEY is required for the Agent Worker");
    expect(backup).toContain('dotenv.config({ path: ".env.local", override: true })');
    // 0.11.0-C: the never-powered items materialization was deleted (ADR-0036).
    expect(preflight).not.toContain("agent_conversation_items");
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
    expect(release).toContain("shared/secrets/production.env");
    expect(release).toContain('ln -s "$SHARED_ENV" "$RELEASE_DIR/.env.local"');
    expect(release).toContain("umask 077");
    expect(release).not.toContain("\r");
    expect(rollback).toContain("AGENT_WORKER_PAUSE_CLAIMS=1");
    expect(rollback).toContain("current.next");
    expect(rollback).toContain("replace_pm2_runtime");
    expect(rollback).toContain("timeout --signal=TERM --kill-after=5s 15s");
    expect(rollback).toContain('kill -KILL "$process_pid"');
    expect(rollback).not.toContain("startOrReload");
    expect(rollback).toContain("http://127.0.0.1:3100/login");
    expect(rollback).toContain("shared/agent-artifacts");
    expect(rollback).toContain("shared/secrets/production.env");
    expect(rollback).toContain("rollback .env.local must point to the shared production environment");
    expect(rollback).not.toContain("\r");
    expect(ecosystem).toContain('"shared", "secrets", "production.env"');
    expect(workerEntry).toContain("AgentBackgroundJobWorker");
    expect(workerEntry).toContain("PostgresAgentBackgroundJobStore");
    expect(workerEntry).toContain("AGENT_BACKGROUND_JOB_CONCURRENCY");
  });

  it("takes production values from the shared file over stale inherited values", () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-deployment-"));
    try {
      const releaseDirectory = path.join(temporaryRoot, "releases", "test");
      const sharedDirectory = path.join(temporaryRoot, "shared", "secrets");
      fs.mkdirSync(releaseDirectory, { recursive: true });
      fs.mkdirSync(sharedDirectory, { recursive: true });
      fs.copyFileSync(path.join(ROOT, "ecosystem.config.cjs"), path.join(releaseDirectory, "ecosystem.config.cjs"));
      fs.writeFileSync(path.join(sharedDirectory, "production.env"), "DB_DRIVER=postgres\nAGENT_RUNTIME_MODE=worker_all\nDATABASE_URL=postgres://shared.example/production\nDEEPSEEK_API_KEY=sk-shared\n");

      const result = spawnSync(process.execPath, [
        "-e",
        "const config = require(process.argv[1]); console.log(JSON.stringify(config.apps.map((app) => app.env)))",
        path.join(releaseDirectory, "ecosystem.config.cjs"),
      ], {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_PATH: path.join(ROOT, "node_modules"),
          DATABASE_URL: "postgres://stale.example/old",
          DEEPSEEK_API_KEY: "sk-stale",
        },
      });

      expect(result.status).toBe(0);
      const environments = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1) || "[]") as Array<Record<string, string>>;
      expect(environments).toHaveLength(2);
      for (const environment of environments) {
        expect(environment.DATABASE_URL).toBe("postgres://shared.example/production");
        expect(environment.DEEPSEEK_API_KEY).toBe("sk-shared");
      }
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects the example model key even when the shell inherited a different key", () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-preflight-"));
    try {
      fs.writeFileSync(path.join(temporaryRoot, ".env.local"), "DEEPSEEK_API_KEY=your_deepseek_api_key_here\n");
      const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-agent-runtime-preflight.mjs")], {
        cwd: temporaryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "",
          AGENT_ARTIFACT_DIR: "",
          DEEPSEEK_API_KEY: "sk-inherited",
        },
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("DEEPSEEK_API_KEY is required for the Agent Worker");
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
