import path from "node:path";
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { requireInterviewEvidenceId, reserveInterviewEvidence } from "./scripts/lib/spec40-interview-evidence.mjs";
import { readMemoryBrowserFixture } from "./scripts/lib/spec40-memory-browser-build.mjs";

const directory = path.resolve(".private/spec40/memory-browser");
const { fixture, manifestSha256 } = readMemoryBrowserFixture(directory);
const fixtureIdentity = fixture.fixtureIdentity;
const evidenceId = requireInterviewEvidenceId(process.env.SPEC40_MEMORY_BROWSER_EVIDENCE_ID);
reserveInterviewEvidence({ evidenceRoot: path.resolve(".e2e/spec40-fourth-memory"), evidenceId });

export default {
  tests: "tests/spec40-memory/**/*.e2e.ts", workers: 1, launchTimeout: 120_000,
  timeout: 150_000, assertionTimeout: 30_000, retries: 0, cache: "off", trace: "on",
  output: ".e2e/spec40-fourth-memory/" + evidenceId, reporters: ["list", "junit", "markdown"],
  credentials: Object.fromEntries(Object.entries(fixture.users).map(([name, user]) => [name, {
    username: (user as { username: string }).username, password: (user as { password: string }).password,
  }])),
  targets: [{ name: "spec40-memory-production-chromium", engine: web({ locale: "zh-CN", timezoneId: "Asia/Shanghai" }),
    app: { url: "http://127.0.0.1:0", readyUrl: "http://127.0.0.1:{port}/login", environment: "staging",
      command: { executable: process.execPath, args: ["scripts/run-spec40-memory-browser-app.mjs", "{port}"],
        env: { SPEC40_MEMORY_BROWSER_FIXTURE_ID: fixtureIdentity, SPEC40_MEMORY_BROWSER_EVIDENCE_ID: evidenceId,
          SPEC40_MEMORY_BROWSER_MANIFEST_SHA256: manifestSha256 },
        startupTimeout: 120_000, log: ".private/spec40/memory-browser/app-" + evidenceId + ".log" } } }],
} satisfies E2EConfig;
