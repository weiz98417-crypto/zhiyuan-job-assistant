import fs from "node:fs";
import path from "node:path";
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { requireInterviewEvidenceId, reserveInterviewEvidence } from "./scripts/lib/spec40-interview-evidence.mjs";

const fixture = JSON.parse(fs.readFileSync(path.resolve(".private/spec40/interview/fixture.json"), "utf8"));
const evidenceId = requireInterviewEvidenceId(process.env.SPEC40_INTERVIEW_EVIDENCE_ID);
const database = new URL(fixture.connectionString);
if (database.hostname !== "127.0.0.1" || database.port !== "55440" || database.pathname !== "/spec40_interview_external") {
  throw new Error("External interview suite requires the dedicated local database");
}
reserveInterviewEvidence({ evidenceRoot: path.resolve(".e2e/spec40-third-interview"), evidenceId });

export default {
  tests: "tests/spec40-interview/**/*.e2e.ts", workers: 1,
  launchTimeout: 120_000, timeout: process.env.SPEC40_INTERVIEW_MODEL_MODE === "real" ? 600_000 : 150_000,
  assertionTimeout: 45_000,
  output: ".e2e/spec40-third-interview/" + evidenceId, reporters: ["list", "junit", "markdown"],
  credentials: {
    interviewOwner: { username: fixture.users.owner.username, password: fixture.users.owner.password },
    interviewForeign: { username: fixture.users.foreign.username, password: fixture.users.foreign.password },
  },
  targets: [{
    name: "spec40-interview-external-chromium",
    engine: web({ locale: "zh-CN", timezoneId: "Asia/Shanghai" }),
    app: {
      url: "http://127.0.0.1:0", readyUrl: "http://127.0.0.1:{port}/login",
      command: { executable: process.execPath, args: ["scripts/run-spec40-interview-app.mjs", "{port}"],
        env: { SPEC40_INTERVIEW_MODEL_MODE: process.env.SPEC40_INTERVIEW_MODEL_MODE || "keyless", SPEC40_INTERVIEW_EVIDENCE_ID: evidenceId },
        startupTimeout: 120_000, log: ".private/spec40/interview/" + evidenceId + ".log" },
    },
  }],
} satisfies E2EConfig;
