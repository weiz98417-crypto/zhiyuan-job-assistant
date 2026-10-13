import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function manifest() {
  const result = spawnSync(process.execPath, ["scripts/build-e2e-remediation-manifest.mjs"], { cwd: process.cwd(), encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe("Spec 40 remediation inventory", () => {
  it("assigns all normative cases and every issue without claiming new acceptance", () => {
    const inventory = manifest();
    expect(inventory.counts).toEqual({ cases: 392, agent: 222, otherPages: 170, issues: 67 });
    expect(new Set(inventory.cases.map((entry: { id: string }) => entry.id)).size).toBe(392);
    expect(new Set(inventory.issues.map((entry: { issueId: string }) => entry.issueId)).size).toBe(67);
    for (const entry of inventory.cases) {
      expect(entry.ownerPackage).toMatch(/^W\d{2}$/);
      expect(entry.oracle).toBeTruthy();
      expect(entry.status).toBe("not_run");
      expect(entry.evidence).toEqual([]);
      const spec = fs.readFileSync(path.join(process.cwd(), entry.spec), "utf8").split(/\r?\n/);
      expect(spec[entry.line - 1]).toContain(entry.id);
    }
    for (const issue of inventory.issues) {
      expect(issue.storyIds.length > 0 || Boolean(issue.matrixOnlyReason)).toBe(true);
      expect(issue.closureStatus).toBe("open");
      for (const caseId of issue.caseIds) {
        expect(inventory.cases.find((entry: { id: string }) => entry.id === caseId).issueIds).toContain(issue.issueId);
      }
    }
    for (const caseId of ["AC-RUN-016", "AC-EXT-010"]) {
      expect(inventory.cases.find((entry: { id: string }) => entry.id === caseId).requiredLayers).toContain("FAULT");
    }
  });

  it("blocks release when a unit-only result is relabeled as browser acceptance", () => {
    const script = `import { remediationGateFailures } from './scripts/build-e2e-remediation-manifest.mjs';
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      const inventory = JSON.parse(Buffer.concat(chunks).toString());
      for (const entry of inventory.cases) {
        entry.status = 'pass'; entry.fixture.status = 'verified'; entry.parameters.expansionStatus = 'complete';
        entry.evidence = [{ layer: 'UNIT', result: 'pass', source: 'vitest' }];
      }
      process.stdout.write(JSON.stringify(remediationGateFailures(inventory)));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(), input: JSON.stringify(manifest()), encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    const failures = JSON.parse(result.stdout);
    expect(failures).toContain("AC-CTX-017:missing_BROWSER-MOCK");
    expect(failures).toContain("ISS-048:open");
    expect(failures).toContain("runtimePreflight");
  });
});
