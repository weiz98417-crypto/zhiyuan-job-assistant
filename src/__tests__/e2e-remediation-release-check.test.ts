import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];

function inventory() {
  const result = spawnSync(process.execPath, ["scripts/build-e2e-remediation-manifest.mjs"], {
    cwd: process.cwd(), encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

function check(manifest: unknown, arrange?: (directory: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spec40-release-check-"));
  directories.push(directory);
  const manifestPath = path.join(directory, "acceptance.json");
  const reportPath = path.join(directory, "report.json");
  arrange?.(directory);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const result = spawnSync(process.execPath, [
    "scripts/check-e2e-remediation-gate.mjs", `--manifest=${manifestPath}`,
    `--evidence-root=${directory}`, `--output=${reportPath}`,
  ], { cwd: process.cwd(), encoding: "utf8" });
  expect(fs.existsSync(reportPath), result.stderr).toBe(true);
  return { exitCode: result.status, report: JSON.parse(fs.readFileSync(reportPath, "utf8")) };
}

function reference(directory: string, name: string, value: unknown) {
  const content = JSON.stringify(value);
  fs.writeFileSync(path.join(directory, name), content);
  return { path: name, sha256: createHash("sha256").update(content).digest("hex") };
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Spec 40 external release evidence check", () => {
  it("rejects self-reported green cases and prerequisites without execution evidence", () => {
    const manifest = inventory();
    for (const prerequisite of ["runtimePreflight", "migrationDryRun", "toolManifest"]) manifest[prerequisite] = "pass";
    for (const issue of manifest.issues) issue.closureStatus = "closed";
    for (const entry of manifest.cases) {
      entry.status = "pass";
      entry.fixture.status = "verified";
      entry.parameters.expansionStatus = "complete";
      entry.evidence = entry.requiredLayers.map((layer: string) => ({
        layer, result: "pass", buildId: "manual", fixtureHash: "manual",
        readBack: true, prohibitedEffects: true, refresh: true, source: "manual",
      }));
    }
    const result = check(manifest);
    expect(result.exitCode).toBe(1);
    expect(result.report.passed).toBe(false);
    expect(result.report.failures).toContain("release:identity_missing");
    expect(result.report.failures).toContain("runtimePreflight:receipt_missing");
    expect(result.report.failures).toContain("AC-RUN-016:parameter_matrix_missing");
    expect(result.report.failures).toContain("AC-RUN-016:evidence_reference_missing");
  });

  it("compares acceptance requirements with the normative specs rather than trusting edited manifest rows", () => {
    const manifest = inventory();
    manifest.cases.find((entry: { id: string }) => entry.id === "AC-RUN-016").requiredLayers = ["UNIT"];
    manifest.cases.find((entry: { id: string }) => entry.id === "AC-CTX-017").oracle = "clicked";
    manifest.issues.find((entry: { issueId: string }) => entry.issueId === "ISS-048").priority = "P2";
    const result = check(manifest);
    expect(result.exitCode).toBe(1);
    expect(result.report.failures).toContain("AC-RUN-016:normative_definition_mismatch");
    expect(result.report.failures).toContain("AC-CTX-017:normative_definition_mismatch");
    expect(result.report.failures).toContain("ISS-048:normative_definition_mismatch");
  });

  it("rejects a failed execution and stale build receipt despite green manifest labels", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    const entry = manifest.cases.find((item: { id: string }) => item.id === "AC-CTX-017");
    const fixtureHash = "b".repeat(64);
    entry.parameters.instances = [{ id: "owner-switch", values: { from: "A", to: "B" }, fixtureHash, fixtureVersion: "owner-v1" }];
    const result = check(manifest, (directory) => {
      entry.evidence = [{ layer: "BROWSER-MOCK", result: "pass", receipt: reference(directory, "execution.json", {
        schemaVersion: 1, kind: "case", caseId: entry.id, parameterId: "owner-switch", layer: "BROWSER-MOCK",
        result: "fail", release: { ...manifest.release, codeCommit: "c".repeat(40) },
        fixtureHash, fixtureVersion: "owner-v1", deterministicFailures: ["owner_scope"], observations: [],
      }) }];
    });
    expect(result.report.failures).toContain("AC-CTX-017:evidence:execution_failed");
    expect(result.report.failures).toContain("AC-CTX-017:evidence:release_identity_mismatch");
    expect(result.report.failures).toContain("AC-CTX-017:evidence:independent_records_missing");
    expect(result.report.failures).toContain("AC-CTX-017:owner-switch:missing_BROWSER-LIVE");
  });

  it("rejects hashed prerequisite receipts whose actual checks failed", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    manifest.runtimePreflight = "pass";
    const result = check(manifest, (directory) => {
      manifest.prerequisiteEvidence = { runtimePreflight: reference(directory, "preflight.json", {
        schemaVersion: 1, kind: "prerequisite", name: "runtimePreflight", result: "fail",
        release: manifest.release, failures: ["legacy_endpoint_reachable"], observations: [],
      }) };
    });
    expect(result.report.failures).toContain("runtimePreflight:execution_failed");
    expect(result.report.failures).toContain("runtimePreflight:independent_records_missing");
  });

  it("preserves a first failure and verifies a successful retry as a separate chained execution", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    const entry = manifest.cases.find((item: { id: string }) => item.id === "AC-CTX-017");
    entry.parameters.instances = [{ id: "owner-switch", values: { from: "A", to: "B" }, fixtureHash: "b".repeat(64), fixtureVersion: "owner-v1" }];
    const result = check(manifest, (directory) => {
      const observations = ["request", "output", "readBack", "prohibitedEffects", "refresh", "source"].map((kind) => ({
        kind, reference: reference(directory, `${kind}.json`, { kind, records: ["isolated checker test fixture"] }),
      }));
      const base = { schemaVersion: 1, kind: "case", caseId: entry.id, parameterId: "owner-switch", layer: "BROWSER-MOCK",
        release: manifest.release, fixtureHash: "b".repeat(64), fixtureVersion: "owner-v1", observations };
      const first = reference(directory, "first.json", { ...base, attemptId: "first", attemptNumber: 0, previousReceiptHash: null,
        result: "fail", deterministicFailures: ["owner_scope"] });
      const retry = reference(directory, "retry.json", { ...base, attemptId: "retry", attemptNumber: 1, previousReceiptHash: first.sha256,
        result: "pass", deterministicFailures: [] });
      entry.firstResult = { receipts: [first] };
      entry.retries = [{ receipts: [retry] }];
      entry.evidence = [{ layer: "BROWSER-MOCK", receipt: first }, { layer: "BROWSER-MOCK", receipt: retry }];
    });
    expect(result.report.failures).not.toContain("AC-CTX-017:evidence:execution_failed");
    expect(result.report.failures).not.toContain("AC-CTX-017:owner-switch:missing_BROWSER-MOCK");
    expect(result.report.failures).not.toContain("AC-CTX-017:evidence:attempt_history_invalid");
  });

  it("blocks an Offer decision below its fixed quality threshold even when its execution is marked passed", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    const entry = manifest.cases.find((item: { id: string }) => item.id === "AC-SIN-007");
    entry.parameters.instances = [{ id: "unknown-terms", values: { benefits: null }, fixtureHash: "b".repeat(64),
      fixtureVersion: "offer-v1", taskTypes: ["offer_evaluation"] }];
    const result = check(manifest, (directory) => {
      const receipt = reference(directory, "offer.json", {
        schemaVersion: 1, kind: "case", caseId: entry.id, parameterId: "unknown-terms", layer: "BROWSER-LIVE",
        release: manifest.release, fixtureHash: "b".repeat(64), fixtureVersion: "offer-v1", observations: [],
        attemptId: "offer-eval", attemptNumber: 0, previousReceiptHash: null, result: "pass", deterministicFailures: [],
        quality: [{ taskType: "offer_evaluation", judgeVersion: "judge-v1", rubricVersion: "offer-decision-v1",
          status: "scored", score: 0.79, minimumScore: 0.1 }],
      });
      entry.firstResult = { receipts: [receipt] };
      entry.evidence = [{ layer: "BROWSER-LIVE", receipt }];
    });
    expect(result.report.failures).toContain("AC-SIN-007:evidence:offer_evaluation:quality_below_threshold");
    expect(result.report.failures).toContain("release:quality_calibration_missing");
  });

  it("refuses to call one generic sample a calibration of every task rubric", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    const result = check(manifest, (directory) => {
      const policy = spawnSync(process.execPath, ["--input-type=module", "-e",
        "import {QUALITY_POLICY_HASH} from './scripts/lib/e2e-release-quality-policy.mjs'; process.stdout.write(QUALITY_POLICY_HASH);"],
      { cwd: process.cwd(), encoding: "utf8" });
      expect(policy.status).toBe(0);
      const sample = reference(directory, "sample.json", { score: 1 });
      manifest.release.qualityCalibration = reference(directory, "calibration.json", {
        schemaVersion: 1, kind: "quality-calibration", result: "pass", policyVersion: "spec40-task-risk-v1",
        policyHash: policy.stdout, judgeVersion: "judge-v1", fixtureHash: "b".repeat(64), sampleCount: 1,
        approvedBy: "isolated-checker-test", observations: [{ reference: sample }],
      });
    });
    expect(result.report.failures).toContain("release:quality_calibration_task_matrix_incomplete");
  });

  it("rejects a calibration whose policy hash omits the fixed case-to-task risk bindings", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    const result = check(manifest, (directory) => {
      const policy = spawnSync(process.execPath, ["--input-type=module", "-e",
        "import {createHash} from 'node:crypto'; import {QUALITY_POLICY_VERSION,TASK_QUALITY_PLANS} from './scripts/lib/e2e-release-quality-policy.mjs'; process.stdout.write(createHash('sha256').update(JSON.stringify({version:QUALITY_POLICY_VERSION,tasks:TASK_QUALITY_PLANS})).digest('hex'));"],
      { cwd: process.cwd(), encoding: "utf8" });
      expect(policy.status).toBe(0);
      const sample = reference(directory, "sample.json", { score: 1 });
      manifest.release.qualityCalibration = reference(directory, "calibration.json", {
        schemaVersion: 1, kind: "quality-calibration", result: "pass", policyVersion: "spec40-task-risk-v1",
        policyHash: policy.stdout, judgeVersion: "judge-v1", fixtureHash: "b".repeat(64), sampleCount: 1,
        approvedBy: "isolated-checker-test", observations: [{ reference: sample }],
      });
    });
    expect(result.report.failures).toContain("release:quality_calibration_invalid");
  });

  it("rejects an omitted first failure even when a replacement pass claims attempt zero", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    const entry = manifest.cases.find((item: { id: string }) => item.id === "AC-CTX-017");
    entry.parameters.instances = [{ id: "owner-switch", values: { from: "A", to: "B" }, fixtureHash: "b".repeat(64), fixtureVersion: "owner-v1" }];
    const result = check(manifest, (directory) => {
      const observations = ["request", "output", "readBack", "prohibitedEffects", "refresh", "source"].map((kind) => ({
        kind, reference: reference(directory, `${kind}.json`, { kind, records: ["isolated checker test fixture"] }),
      }));
      const base = { schemaVersion: 1, kind: "case", caseId: entry.id, parameterId: "owner-switch", layer: "BROWSER-MOCK",
        release: manifest.release, fixtureHash: "b".repeat(64), fixtureVersion: "owner-v1", observations,
        attemptNumber: 0, previousReceiptHash: null };
      const failure = reference(directory, "first-failure.json", { ...base, attemptId: "actual-first", result: "fail", deterministicFailures: ["owner_scope"] });
      const replacement = reference(directory, "replacement.json", { ...base, attemptId: "replacement", result: "pass", deterministicFailures: [] });
      entry.firstResult = { receipts: [failure, replacement] };
      entry.evidence = [{ layer: "BROWSER-MOCK", receipt: replacement }];
    });
    expect(result.report.failures).toContain("AC-CTX-017:evidence:attempt_history_invalid");
    expect(result.report.failures).toContain("AC-CTX-017:owner-switch:missing_BROWSER-MOCK");
  });

  it("rejects relabeling an Offer follow-up as a low-risk generic answer", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    const entry = manifest.cases.find((item: { id: string }) => item.id === "AC-OFR-001");
    entry.parameters.instances = [{ id: "follow-up", values: { report: "OFFER-A1" }, fixtureHash: "b".repeat(64),
      fixtureVersion: "offer-v1", taskTypes: ["general_chat"] }];
    const result = check(manifest, (directory) => {
      const receipt = reference(directory, "generic-offer.json", {
        schemaVersion: 1, kind: "case", caseId: entry.id, parameterId: "follow-up", layer: "BROWSER-LIVE",
        release: manifest.release, fixtureHash: "b".repeat(64), fixtureVersion: "offer-v1", observations: [],
        attemptId: "generic", attemptNumber: 0, previousReceiptHash: null, result: "pass", deterministicFailures: [],
        quality: [{ taskType: "general_chat", judgeVersion: "judge-v1", rubricVersion: "chat-actionability-v1", status: "scored", score: 0.76 }],
      });
      entry.firstResult = { receipts: [receipt] };
      entry.evidence = [{ layer: "BROWSER-LIVE", receipt }];
    });
    expect(result.report.failures).toContain("AC-OFR-001:evidence:quality_task_mismatch");
  });

  it("accepts the task quality binding of the additional recent-application single-turn case", () => {
    const manifest = inventory();
    manifest.release = { buildId: "spec40-test", codeCommit: "a".repeat(40), modelVersion: "model-v1",
      promptVersion: "prompt-v1", toolVersion: "tools-v1", fixtureVersion: "fixtures-v1", judgeVersion: "judge-v1" };
    const entry = manifest.cases.find((item: { id: string }) => item.id === "AC-SIN-014");
    entry.parameters.instances = [{ id: "recent-applications", values: { owner: "A" }, fixtureHash: "b".repeat(64),
      fixtureVersion: "applications-v1", taskTypes: ["general_chat"] }];
    const result = check(manifest, (directory) => {
      const observations = ["request", "output", "readBack", "prohibitedEffects", "refresh", "source"].map((kind) => ({
        kind, reference: reference(directory, `${kind}.json`, { kind, records: ["isolated checker test fixture"] }),
      }));
      const receipt = reference(directory, "recent-applications.json", {
        schemaVersion: 1, kind: "case", caseId: entry.id, parameterId: "recent-applications", layer: "BROWSER-LIVE",
        release: manifest.release, fixtureHash: "b".repeat(64), fixtureVersion: "applications-v1", observations,
        attemptId: "recent", attemptNumber: 0, previousReceiptHash: null, result: "pass", deterministicFailures: [],
        quality: [{ taskType: "general_chat", judgeVersion: "judge-v1", rubricVersion: "chat-actionability-v1", status: "scored", score: 0.9 }],
      });
      entry.firstResult = { receipts: [receipt] };
      entry.evidence = [{ layer: "BROWSER-LIVE", receipt }];
    });
    expect(result.report.failures).not.toContain("AC-SIN-014:evidence:quality_task_mismatch");
    expect(result.report.failures).not.toContain("AC-SIN-014:recent-applications:missing_BROWSER-LIVE");
  });
});
