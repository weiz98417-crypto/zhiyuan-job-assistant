import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { requireInterviewEvidenceId, reserveInterviewEvidence, writeImmutableInterviewEvidence } from "../../scripts/lib/spec40-interview-evidence.mjs";

const temporaryDirectories: string[] = [];

function evidenceRoot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spec40-interview-evidence-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Spec 40 external interview evidence preservation", () => {
  it("requires one explicit ID for config, runtime and test evidence", () => {
    for (const value of [undefined, "", "../existing", "new/evidence"]) expect(() => requireInterviewEvidenceId(value)).toThrow("explicit");
  });

  it("allows config reload only in its own runner and direct child", () => {
    const root = evidenceRoot();
    const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    const first = reserveInterviewEvidence({ evidenceRoot: root, evidenceId: "first", environment, processId: 100, parentId: 50 });
    expect(reserveInterviewEvidence({ evidenceRoot: root, evidenceId: "first", environment, processId: 100, parentId: 50 })).toEqual(first);
    expect(reserveInterviewEvidence({ evidenceRoot: root, evidenceId: "first", environment: { ...environment }, processId: 101, parentId: 100 })).toEqual(first);
    expect(() => reserveInterviewEvidence({ evidenceRoot: root, evidenceId: "first", environment: { NODE_ENV: "test" }, processId: 101, parentId: 100 })).toThrow("already reserved");
  });

  it("rejects a reused ID before startup while preserving first report and oracle bytes", () => {
    const root = evidenceRoot();
    const reserved = reserveInterviewEvidence({ evidenceRoot: root, evidenceId: "first", environment: { NODE_ENV: "test" } });
    fs.mkdirSync(reserved.outputDirectory);
    fs.mkdirSync(reserved.oracleDirectory, { recursive: true });
    const reportPath = path.join(reserved.outputDirectory, "report.json");
    const oraclePath = path.join(reserved.oracleDirectory, "state.json");
    fs.writeFileSync(reportPath, "first failure report");
    fs.writeFileSync(oraclePath, "first failure state");
    const beforeReport = fs.readFileSync(reportPath);
    const beforeOracle = fs.readFileSync(oraclePath);
    const startupPath = path.join(root, "startup-marker");
    const helperUrl = pathToFileURL(path.resolve("scripts/lib/spec40-interview-evidence.mjs")).href;
    const script = [
      `import {reserveInterviewEvidence} from ${JSON.stringify(helperUrl)};`,
      'import fs from "node:fs";',
      'reserveInterviewEvidence({evidenceRoot:process.argv[1],evidenceId:"first"});',
      'fs.writeFileSync(process.argv[2],"started");',
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, root, startupPath], { encoding: "utf8", env: { NODE_ENV: "test" } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("already reserved");
    expect(fs.existsSync(startupPath)).toBe(false);
    expect(fs.readFileSync(reportPath)).toEqual(beforeReport);
    expect(fs.readFileSync(oraclePath)).toEqual(beforeOracle);
  });

  it("protects existing pre-reservation evidence and never overwrites changed oracle content", () => {
    const root = evidenceRoot();
    fs.mkdirSync(path.join(root, "historical"));
    expect(() => reserveInterviewEvidence({ evidenceRoot: root, evidenceId: "historical", environment: { NODE_ENV: "test" } })).toThrow("already exists");
    const oracle = path.join(root, "oracle.json");
    writeImmutableInterviewEvidence(oracle, { status: "first failure" });
    writeImmutableInterviewEvidence(oracle, { status: "first failure" });
    const before = fs.readFileSync(oracle);
    expect(() => writeImmutableInterviewEvidence(oracle, { status: "later success" })).toThrow("overwrite");
    expect(fs.readFileSync(oracle)).toEqual(before);
  });
});
