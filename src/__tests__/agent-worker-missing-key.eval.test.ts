import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Agent Worker release preflight", () => {
  it("rejects a release with no Worker model key", () => {
    const workdir = mkdtempSync(path.join(tmpdir(), "agent-preflight-eval-"));
    try {
      const script = path.join(process.cwd(), "scripts/check-agent-runtime-preflight.mjs");
      const run = spawnSync(process.execPath, [script], {
        cwd: workdir,
        encoding: "utf8",
        env: {
          ...process.env,
          DEEPSEEK_API_KEY: "",
          DATABASE_URL: "",
        },
      });
      expect(run.error).toBeUndefined();
      expect(run.status).toBe(1);
      const report = JSON.parse(run.stdout);
      expect(report.ok).toBe(false);
      expect(report.failures).toContain("DEEPSEEK_API_KEY is required for the Agent Worker");
    } finally {
      rmdirSync(workdir);
    }
  });

  it("rejects inherited keys and release-local artifacts when the shared file omits them", () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-preflight-release-eval-"));
    const releases = path.join(root, "releases");
    const candidate = path.join(releases, "candidate");
    mkdirSync(candidate, { recursive: true });
    const environmentFile = path.join(candidate, ".env.local");
    writeFileSync(environmentFile, "DB_DRIVER=postgres\nAGENT_RUNTIME_MODE=worker_all\nAGENT_ARTIFACT_DIR=./artifacts\n");
    try {
      const script = path.join(process.cwd(), "scripts/check-agent-runtime-preflight.mjs");
      const run = spawnSync(process.execPath, [script], {
        cwd: candidate,
        encoding: "utf8",
        env: {
          ...process.env,
          DEEPSEEK_API_KEY: "inherited-key-must-not-count",
          DATABASE_URL: "",
        },
      });
      expect(run.error).toBeUndefined();
      expect(run.status).toBe(1);
      const report = JSON.parse(run.stdout);
      expect(report.failures).toContain("DEEPSEEK_API_KEY is required for the Agent Worker");
      expect(report.failures).toContain("AGENT_ARTIFACT_DIR must use the shared production artifact directory");
    } finally {
      unlinkSync(environmentFile);
      rmdirSync(candidate);
      rmdirSync(releases);
      rmdirSync(root);
    }
  });
});
