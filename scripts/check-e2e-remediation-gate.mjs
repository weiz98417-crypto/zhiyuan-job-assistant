import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildRemediationManifest, remediationGateFailures } from "./build-e2e-remediation-manifest.mjs";
import { QUALITY_POLICY_VERSION, QUALITY_POLICY_HASH, TASK_QUALITY_PLANS, SINGLE_TURN_TASKS, REQUIRED_CASE_TASKS } from "./lib/e2e-release-quality-policy.mjs";

const VERSION_FIELDS = ["buildId", "codeCommit", "modelVersion", "promptVersion", "toolVersion", "fixtureVersion", "judgeVersion"];
const SHA256 = /^[a-f0-9]{64}$/;

function normativeInventory(repositoryRoot) {
  return buildRemediationManifest({
    agentSpec: fs.readFileSync(path.join(repositoryRoot, "docs/testing/agentchat-e2e-spec.md"), "utf8"),
    pageSpec: fs.readFileSync(path.join(repositoryRoot, "docs/testing/other-pages-e2e-spec.md"), "utf8"),
    matrix: fs.readFileSync(path.join(repositoryRoot, "docs/testing/e2e-remediation-matrix-2026-10-13.md"), "utf8"),
  });
}

function validateDefinitions(manifest, expected, failures) {
  const definitions = [
    ["cases", "id", ["spec", "line", "input", "expected", "oracle", "ownerPackage", "collaboratingPackages", "issueIds", "requiredLayers"]],
    ["issues", "issueId", ["priority", "ownerPackage", "storyIds", "caseIds", "matrixOnlyReason", "acceptance"]],
  ];
  for (const [collection, key, fields] of definitions) {
    const entries = new Map(manifest[collection].map((entry) => [entry[key], entry]));
    if (manifest[collection].length !== expected[collection].length || entries.size !== expected[collection].length
      || [...entries.keys()].some((id) => !expected[collection].some((entry) => entry[key] === id))) {
      failures.push(`${collection}:normative_inventory_mismatch`);
    }
    for (const definition of expected[collection]) {
      const actual = entries.get(definition[key]);
      if (!actual || fields.some((field) => JSON.stringify(actual[field]) !== JSON.stringify(definition[field]))) {
        failures.push(`${definition[key]}:normative_definition_mismatch`);
      }
    }
  }
}

function readReference(reference, root, label, failures, parseJson = true) {
  if (!reference || typeof reference.path !== "string" || !SHA256.test(reference.sha256 || "")) {
    failures.push(`${label}:reference_missing`);
    return null;
  }
  try {
    if (path.isAbsolute(reference.path)) throw new Error("absolute");
    const resolvedRoot = fs.realpathSync(root);
    const resolvedPath = fs.realpathSync(path.resolve(resolvedRoot, reference.path));
    const relative = path.relative(resolvedRoot, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("outside_root");
    const content = fs.readFileSync(resolvedPath);
    if (createHash("sha256").update(content).digest("hex") !== reference.sha256) {
      failures.push(`${label}:hash_mismatch`);
      return null;
    }
    return parseJson ? JSON.parse(content.toString("utf8")) : content;
  } catch {
    failures.push(`${label}:unreadable_or_unsafe`);
    return null;
  }
}

function matchesRelease(actual, expected) {
  return Boolean(actual && expected && VERSION_FIELDS.every((field) => actual[field] === expected[field]));
}

function validatePrerequisite(receipt, name, release, root, failures) {
  if (!receipt || receipt.schemaVersion !== 1 || receipt.kind !== "prerequisite" || receipt.name !== name) {
    failures.push(`${name}:receipt_invalid`);
    return;
  }
  if (receipt.result !== "pass" || !Array.isArray(receipt.failures) || receipt.failures.length) {
    failures.push(`${name}:execution_failed`);
  }
  if (!matchesRelease(receipt.release, release)) failures.push(`${name}:release_identity_mismatch`);
  const observations = Array.isArray(receipt.observations) ? receipt.observations : [];
  const required = {
    runtimePreflight: ["runtimeMode", "executionOwner", "legacyEndpoints", "buildArtifacts"],
    migrationDryRun: ["impactList", "dryRun", "readBack", "rollback"],
    toolManifest: ["staticRegistry", "dynamicRegistry", "coverage", "registryDiff"],
  }[name];
  if (required.some((kind) => !observations.some((observation) => observation.kind === kind))) {
    failures.push(`${name}:independent_records_missing`);
  }
  for (const observation of observations) readReference(observation.reference, root, `${name}:${observation.kind}`, failures, false);
}

function validateQualityCalibration(release, root, failures) {
  if (!release?.qualityCalibration) {
    failures.push("release:quality_calibration_missing");
    return;
  }
  const record = readReference(release.qualityCalibration, root, "release:quality_calibration", failures);
  if (!record || record.schemaVersion !== 1 || record.kind !== "quality-calibration" || record.result !== "pass"
    || record.policyVersion !== QUALITY_POLICY_VERSION || record.policyHash !== QUALITY_POLICY_HASH
    || record.judgeVersion !== release.judgeVersion || !SHA256.test(record.fixtureHash || "")
    || !Number.isSafeInteger(record.sampleCount) || record.sampleCount < 1
    || typeof record.approvedBy !== "string" || !record.approvedBy.trim()
    || !Array.isArray(record.observations) || !record.observations.length) {
    failures.push("release:quality_calibration_invalid");
    return;
  }
  for (const observation of record.observations) readReference(observation.reference, root, "release:quality_calibration:sample", failures, false);
  const calibrations = Array.isArray(record.tasks) ? record.tasks : [];
  const required = Object.keys(TASK_QUALITY_PLANS);
  if (calibrations.length !== required.length || new Set(calibrations.map((task) => task.taskType)).size !== required.length
    || required.some((task) => !calibrations.some((calibration) => calibration.taskType === task))) {
    failures.push("release:quality_calibration_task_matrix_incomplete");
  }
  let sampleCount = 0;
  for (const calibration of calibrations) {
    const plan = TASK_QUALITY_PLANS[calibration.taskType];
    const label = `release:quality_calibration:${calibration.taskType}`;
    if (!plan || calibration.rubricVersion !== plan.rubricVersion || calibration.minimumScore !== plan.minimumScore) {
      failures.push(`${label}:policy_mismatch`);
      continue;
    }
    const samples = Array.isArray(calibration.samples) ? calibration.samples : [];
    const negativeOutcome = plan.risk === "critical" ? "block" : "degrade";
    if (!samples.some((sample) => sample.expectedOutcome === "pass")
      || !samples.some((sample) => sample.expectedOutcome === negativeOutcome)
      || new Set(samples.map((sample) => sample.fixtureHash)).size !== samples.length) {
      failures.push(`${label}:positive_and_negative_samples_missing`);
    }
    sampleCount += samples.length;
    for (const sample of samples) {
      const observation = readReference(sample.reference, root, `${label}:sample`, failures);
      if (!observation || observation.schemaVersion !== 1 || observation.kind !== "quality-calibration-sample"
        || observation.taskType !== calibration.taskType || observation.rubricVersion !== plan.rubricVersion
        || observation.judgeVersion !== release.judgeVersion || observation.fixtureHash !== sample.fixtureHash
        || !SHA256.test(sample.fixtureHash || "") || !Number.isFinite(observation.score)
        || observation.score < 0 || observation.score > 1
        || !["pass", negativeOutcome].includes(sample.expectedOutcome)
        || sample.expectedOutcome !== (observation.score >= plan.minimumScore ? "pass" : negativeOutcome)
        || observation.expectedOutcome !== sample.expectedOutcome || observation.actualOutcome !== sample.expectedOutcome) {
        failures.push(`${label}:sample_does_not_calibrate`);
      }
    }
  }
  if (sampleCount !== record.sampleCount) failures.push("release:quality_calibration_sample_count_mismatch");
}

function validateQuality(receipt, entry, instance, release, root, failures, limitations) {
  const label = `${entry.id}:evidence`;
  const taskTypes = Array.isArray(instance?.taskTypes) ? instance.taskTypes : [];
  if (!taskTypes.length || taskTypes.some((task) => !Object.hasOwn(TASK_QUALITY_PLANS, task))) {
    failures.push(`${label}:quality_tasks_missing_or_unknown`);
  }
  if (/^AC-SIN-\d{3}$/.test(entry.id)) {
    const expected = SINGLE_TURN_TASKS[Number(entry.id.slice(-3)) - 1];
    if (expected && !taskTypes.includes(expected)) failures.push(`${label}:quality_task_mismatch`);
  }
  const requiredTasks = REQUIRED_CASE_TASKS[entry.id.replace(/-\d{3}$/, "")] || [];
  if (requiredTasks.some((task) => !taskTypes.includes(task))) failures.push(`${label}:quality_task_mismatch`);
  const scores = Array.isArray(receipt.quality) ? receipt.quality : [];
  for (const task of taskTypes) {
    const plan = TASK_QUALITY_PLANS[task];
    if (!plan) continue;
    const records = scores.filter((quality) => quality.taskType === task);
    const quality = records[0];
    if (records.length !== 1 || quality.judgeVersion !== release?.judgeVersion || quality.rubricVersion !== plan.rubricVersion) {
      failures.push(`${label}:${task}:quality_evidence_missing_or_mismatched`);
      continue;
    }
    const scored = quality.status === "scored" && Number.isFinite(quality.score) && quality.score >= 0 && quality.score <= 1;
    if (scored && quality.score >= plan.minimumScore) continue;
    if (plan.risk === "critical") {
      failures.push(`${label}:${task}:${scored ? "quality_below_threshold" : "judge_unavailable"}`);
      continue;
    }
    const output = (receipt.observations || []).find((observation) => observation.kind === "output");
    const content = output && readReference(output.reference, root, `${label}:quality_limitation`, failures, false);
    if (quality.outcome !== "degraded" || typeof quality.limitation !== "string" || !quality.limitation.trim()
      || !content || !content.toString("utf8").includes(quality.limitation)) {
      failures.push(`${label}:${task}:degradation_not_visible`);
    } else limitations.push(`${entry.id}:${instance.id}:${task}:degraded`);
  }
}

function validateCaseReceipt(receipt, entry, evidence, instances, release, root, failures, limitations, final = true) {
  const label = `${entry.id}:evidence`;
  const before = failures.length;
  if (receipt.schemaVersion !== 1 || receipt.kind !== "case" || receipt.caseId !== entry.id
    || receipt.layer !== evidence.layer || !entry.requiredLayers.includes(receipt.layer)) {
    failures.push(`${label}:case_or_layer_mismatch`);
  }
  if (!["pass", "fail"].includes(receipt.result) || !Array.isArray(receipt.deterministicFailures)
    || (final && (receipt.result !== "pass" || receipt.deterministicFailures.length))) {
    failures.push(`${label}:execution_failed`);
  }
  if (final && !matchesRelease(receipt.release, release)) failures.push(`${label}:release_identity_mismatch`);
  const instance = instances.find((parameter) => parameter.id === receipt.parameterId);
  if (!instance || (final && (receipt.fixtureHash !== instance.fixtureHash || receipt.fixtureVersion !== instance.fixtureVersion))) {
    failures.push(`${label}:fixture_or_parameter_mismatch`);
  }
  const observations = Array.isArray(receipt.observations) ? receipt.observations : [];
  const required = ["request", "output", "readBack", "prohibitedEffects", "refresh", "source"];
  if (required.some((kind) => !observations.some((observation) => observation.kind === kind))) {
    failures.push(`${label}:independent_records_missing`);
  }
  for (const observation of observations) {
    readReference(observation.reference, root, `${label}:${observation.kind}`, failures, false);
  }
  if (final && receipt.layer === "BROWSER-LIVE") validateQuality(receipt, entry, instance, release, root, failures, limitations);
  return failures.length === before;
}

function validateAttemptHistory(records, entry, failures) {
  const firstHashes = (entry.firstResult?.receipts || []).map((reference) => reference.sha256);
  const retryHashes = (entry.retries || []).flatMap((retry) => (retry.receipts || []).map((reference) => reference.sha256));
  const valid = records.every(({ receipt, evidence }, index) =>
    typeof receipt.attemptId === "string" && receipt.attemptId.trim() && receipt.attemptNumber === index
    && (index === 0
      ? receipt.previousReceiptHash === null && firstHashes.includes(evidence.receipt.sha256)
      : receipt.previousReceiptHash === records[index - 1].evidence.receipt.sha256 && retryHashes.includes(evidence.receipt.sha256)))
    && new Set(records.map(({ receipt }) => receipt.attemptId)).size === records.length;
  if (!valid) failures.push(`${entry.id}:evidence:attempt_history_invalid`);
  return valid;
}

function validateDeclaredAttempts(records, entry, failures) {
  const declared = [...(entry.firstResult?.receipts || []), ...(entry.retries || []).flatMap((retry) => retry.receipts || [])];
  const hashes = declared.map((reference) => reference.sha256);
  const actual = records.map(({ evidence }) => evidence.receipt.sha256);
  const valid = hashes.length === actual.length && new Set(hashes).size === hashes.length
    && new Set(actual).size === actual.length && hashes.every((hash) => actual.includes(hash));
  if (!valid) failures.push(`${entry.id}:evidence:attempt_history_invalid`);
  return valid;
}

export function checkRemediationRelease({ manifest, evidenceRoot, repositoryRoot = process.cwd() }) {
  const failures = [];
  const limitations = [];
  if (!manifest || !Array.isArray(manifest.cases) || !Array.isArray(manifest.issues)) {
    return { passed: false, failures: ["manifest:invalid"], caseCount: 0, issueCount: 0 };
  }
  try {
    failures.push(...remediationGateFailures(manifest));
    validateDefinitions(manifest, normativeInventory(repositoryRoot), failures);
  } catch {
    failures.push("manifest:invalid_definition");
  }
  const release = manifest.release;
  if (!release || VERSION_FIELDS.some((field) => typeof release[field] !== "string" || !release[field].trim())
    || !/^[a-f0-9]{40}$/.test(release.codeCommit || "")) failures.push("release:identity_missing");
  validateQualityCalibration(release, evidenceRoot, failures);
  for (const prerequisite of ["runtimePreflight", "migrationDryRun", "toolManifest"]) {
    const receipt = manifest.prerequisiteEvidence?.[prerequisite];
    if (!receipt) failures.push(`${prerequisite}:receipt_missing`);
    else {
      const record = readReference(receipt, evidenceRoot, prerequisite, failures);
      if (record) validatePrerequisite(record, prerequisite, release, evidenceRoot, failures);
      else failures.push(`${prerequisite}:receipt_invalid`);
    }
  }
  for (const entry of manifest.cases) {
    const instances = Array.isArray(entry.parameters?.instances) ? entry.parameters.instances : [];
    if (!instances.length) failures.push(`${entry.id}:parameter_matrix_missing`);
    if (new Set(instances.map((instance) => instance.id)).size !== instances.length || instances.some((instance) =>
      typeof instance.id !== "string" || !instance.id.trim() || !SHA256.test(instance.fixtureHash || "")
      || typeof instance.fixtureVersion !== "string" || !instance.fixtureVersion.trim()
      || !instance.values || typeof instance.values !== "object" || Array.isArray(instance.values))) {
      failures.push(`${entry.id}:parameter_matrix_invalid`);
    }
    const covered = new Set();
    const byParameterLayer = new Map();
    for (const evidence of entry.evidence || []) {
      if (!evidence.receipt) failures.push(`${entry.id}:evidence_reference_missing`);
      else {
        const receipt = readReference(evidence.receipt, evidenceRoot, `${entry.id}:evidence`, failures);
        if (receipt) {
          const key = `${receipt.parameterId}:${receipt.layer}`;
          const records = byParameterLayer.get(key) || [];
          records.push({ receipt, evidence });
          byParameterLayer.set(key, records);
        }
      }
    }
    const declaredValid = validateDeclaredAttempts([...byParameterLayer.values()].flat(), entry, failures);
    for (const [key, records] of byParameterLayer) {
      records.sort((first, second) => first.receipt.attemptNumber - second.receipt.attemptNumber);
      const historyValid = validateAttemptHistory(records, entry, failures);
      const valid = records.map(({ receipt, evidence }, index) => validateCaseReceipt(
        receipt, entry, evidence, instances, release, evidenceRoot, failures, limitations, index === records.length - 1,
      )).every(Boolean);
      if (declaredValid && historyValid && valid) covered.add(key);
    }
    for (const instance of instances) for (const layer of entry.requiredLayers || []) {
      if (!covered.has(`${instance.id}:${layer}`)) failures.push(`${entry.id}:${instance.id}:missing_${layer}`);
    }
  }
  return { passed: failures.length === 0, failures: [...new Set(failures)], limitations: [...new Set(limitations)],
    caseCount: manifest.cases.length, issueCount: manifest.issues.length };
}

function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifestPath = argument("manifest");
  const evidenceRoot = argument("evidence-root");
  if (!manifestPath || !evidenceRoot) {
    process.stderr.write("Required: --manifest=<json> --evidence-root=<directory> [--output=<json>]\n");
    process.exitCode = 2;
  } else {
    let report;
    try {
      report = checkRemediationRelease({ manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")), evidenceRoot });
    } catch {
      report = { passed: false, failures: ["manifest:unreadable"], caseCount: 0, issueCount: 0 };
    }
    const output = argument("output");
    if (output) {
      fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    }
    process.stdout.write(JSON.stringify({ passed: report.passed, failureCount: report.failures.length,
      caseCount: report.caseCount, issueCount: report.issueCount }) + "\n");
    process.exitCode = report.passed ? 0 : 1;
  }
}
