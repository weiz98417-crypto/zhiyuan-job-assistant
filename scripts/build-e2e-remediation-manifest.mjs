import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const groupOwners = {
  "AC-SIN": "W02", "AC-TOL": "W02", "AC-RUN": "W02", "AC-CTX": "W02",
  "AC-COL": "W02", "AC-CHN": "W02", "AC-INT": "W03", "AC-RES": "W05",
  "AC-POS": "W06", "AC-MEM": "W07", "AC-OFR": "W12", "AC-UIX": "W11",
  "AC-VOC": "W13", "AC-EXT": "W10", "PG-AUTH": "W01", "PG-SET": "W01",
  "PG-SEC": "W01", "PG-NAV": "W11", "PG-HOME": "W11", "PG-VIS": "W11",
  "PG-PERF": "W11", "PG-ADMIN": "W11", "PG-DISC": "W10", "PG-JD": "W06",
  "PG-CV": "W05", "PG-TRACK": "W08", "PG-IV": "W03", "PG-OFFER": "W12",
  "PG-PROFILE": "W06", "PG-MEM": "W07", "PG-AN": "W09", "PG-REL": "W02",
  "PG-JOURNEY": "W02",
};

const issueStories = {
  1: [1, 2, 3], 2: [50], 3: [28], 4: [34], 5: [35], 6: [21], 7: [20],
  8: [47], 9: [38, 39], 10: [40], 11: [41], 12: [48], 13: [25], 14: [51],
  15: [54], 16: [55], 17: [56], 18: [34], 19: [9, 10], 20: [50], 21: [52],
  22: [13], 23: [14, 30, 31], 24: [21], 25: [49], 26: [42], 27: [22],
  28: [46], 29: [18, 19], 30: [23], 31: [64], 32: [21, 22], 33: [58],
  34: [8, 24], 35: [26], 36: [9, 10], 37: [36], 38: [37], 39: [29],
  40: [32], 41: [60], 42: [4, 5], 43: [61], 44: [60], 45: [43], 46: [57],
  47: [58], 48: [52, 53], 49: [59], 50: [15, 16, 17], 51: [62, 63],
  52: [51], 53: [12, 14], 54: [34], 55: [7], 56: [6], 57: [44],
  58: [43], 59: [45], 60: [43], 61: [33], 62: [63], 63: [27], 64: [65],
  65: [11], 66: [30, 31], 67: [24],
};
const matrixOnlyReasons = {
  6: "服务端报告目标选择是矩阵独立验收要求，主题故事未单列选择器。",
  14: "会话标题搜索与合法 ID 转换是矩阵独立验收要求。",
  18: "投递编号整数范围与唯一生成是矩阵独立验收要求。",
  19: "admitted/effective 合同身份与页面标签对账是矩阵独立验收要求。",
  20: "置顶和删除撤回的服务端持久化是矩阵独立验收要求。",
  21: "匿名密码找回的认证保护是矩阵独立验收要求。",
  33: "Markdown 导入的新增、重复与非法回执是矩阵独立验收要求。",
  54: "投递写入、状态变更与拒信候选的操作合同是矩阵独立验收要求。",
  62: "内部 reasoning/DSML 的用户安全投影是矩阵独立验收要求。",
};

function caseRows(text, spec) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^\|\s*((?:AC|PG)-[A-Z]+-\d{3})\s*\|/);
    if (!match) return [];
    const columns = line.split("|").slice(1, -1).map((column) => column.trim());
    return [{ id: match[1], spec, line: index + 1, input: columns[1], expected: columns[2], oracle: columns.slice(3).join(" | ") }];
  });
}

export function buildRemediationManifest({ agentSpec, pageSpec, matrix, baseline = null }) {
  const definitions = [
    ...caseRows(agentSpec, "docs/testing/agentchat-e2e-spec.md"),
    ...caseRows(pageSpec, "docs/testing/other-pages-e2e-spec.md"),
  ];
  const ids = new Set(definitions.map((entry) => entry.id));
  if (ids.size !== 392 || definitions.length !== 392) throw new Error("Expected exactly 392 unique normative cases");
  const issues = matrix.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\| (ISS-(\d{3})) \/ (P[012]) \| (W\d{2}) \| ([^|]+) \| (.+) \|$/);
    if (!match) return [];
    const caseIds = match[5].match(/(?:AC|PG)-[A-Z]+-\d{3}/g) || [];
    if (!caseIds.length || caseIds.some((id) => !ids.has(id))) throw new Error("Invalid issue case reference: " + match[1]);
    const matrixOnlyReason = matrixOnlyReasons[Number(match[2])];
    const storyIds = matrixOnlyReason ? [] : issueStories[Number(match[2])];
    if (!storyIds?.length && !matrixOnlyReason) throw new Error("Missing story mapping: " + match[1]);
    return [{ issueId: match[1], priority: match[3], ownerPackage: match[4], storyIds, caseIds,
      ...(matrixOnlyReason ? { matrixOnlyReason } : {}), acceptance: match[6], implementationStatus: "planned", closureStatus: "open" }];
  });
  if (issues.length !== 67 || new Set(issues.map((issue) => issue.issueId)).size !== 67) throw new Error("Expected exactly 67 unique issues");
  const baselineCases = new Map((baseline?.cases || []).map((entry) => [entry.id, entry]));
  if (baseline && (baselineCases.size !== 392 || [...baselineCases.keys()].some((id) => !ids.has(id)))) {
    throw new Error("Baseline and normative specifications disagree");
  }
  const cases = definitions.map((entry) => {
    const group = entry.id.replace(/-\d{3}$/, "");
    const ownerPackage = groupOwners[group];
    if (!ownerPackage) throw new Error("Missing case owner: " + entry.id);
    const linkedIssues = issues.filter((issue) => issue.caseIds.includes(entry.id));
    const requiredLayers = entry.id.startsWith("PG-REL-") ? ["CANARY"] : ["BROWSER-MOCK"];
    if (entry.id.startsWith("AC-") || entry.id.startsWith("PG-JOURNEY-")) requiredLayers.push("BROWSER-LIVE");
    if (/^PG-(?:CV-(?:007|013|014|017|018)|IV-(?:007|010)|OFFER-(?:006|007|008)|MEM-(?:004|006|008)|AN-(?:005|007|008)|DISC-(?:005|009|010))$/.test(entry.id)) requiredLayers.push("BROWSER-LIVE");
    if (entry.id === "PG-VIS-004") requiredLayers.push("DEVICE-HARDWARE");
    if (entry.id === "PG-MEM-009") requiredLayers.push("API-INTEGRATION");
    if (["AC-RUN-016", "AC-EXT-010"].includes(entry.id)) requiredLayers.push("FAULT");
    return { ...entry, ownerPackage, collaboratingPackages: [...new Set(linkedIssues.map((issue) => issue.ownerPackage))].filter((owner) => owner !== ownerPackage),
      issueIds: linkedIssues.map((issue) => issue.issueId),
      fixture: { version: group + "-v1", status: "pending_seed" },
      parameters: { document: entry.spec, line: entry.line, expansionStatus: "pending" },
      requiredLayers, baselineStatus: baselineCases.get(entry.id)?.status ?? "unavailable",
      status: "not_run", firstResult: null, retries: [], evidence: [],
    };
  });
  return { schemaVersion: 1, spec: "docs/agent-system-specs/40-e2e-remediation-and-release-gates.md",
    scope: "isolated_or_preview_only", counts: { cases: 392, agent: 222, otherPages: 170, issues: 67 },
    runtimePreflight: "not_run", migrationDryRun: "not_run", toolManifest: "not_run", cases, issues };
}

export function remediationGateFailures(manifest) {
  const failures = [];
  if (manifest.cases.length !== 392 || new Set(manifest.cases.map((entry) => entry.id)).size !== 392) failures.push("case_inventory");
  if (manifest.issues.length !== 67 || new Set(manifest.issues.map((entry) => entry.issueId)).size !== 67) failures.push("issue_inventory");
  for (const prerequisite of ["runtimePreflight", "migrationDryRun", "toolManifest"]) {
    if (manifest[prerequisite] !== "pass") failures.push(prerequisite);
  }
  for (const issue of manifest.issues) if (issue.closureStatus !== "closed") failures.push(issue.issueId + ":open");
  for (const entry of manifest.cases) {
    if (!entry.ownerPackage || !entry.oracle || !entry.fixture.version) failures.push(entry.id + ":incomplete_definition");
    if (entry.fixture.status !== "verified" || entry.parameters.expansionStatus !== "complete") failures.push(entry.id + ":pending_fixture_or_parameters");
    if (entry.status !== "pass") failures.push(entry.id + ":not_passed");
    for (const layer of entry.requiredLayers) {
      if (!entry.evidence.some((evidence) => evidence.layer === layer && evidence.result === "pass"
        && evidence.buildId && evidence.fixtureHash && evidence.readBack && evidence.prohibitedEffects
        && evidence.refresh && evidence.source)) failures.push(entry.id + ":missing_" + layer);
    }
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const baselineArg = process.argv.find((argument) => argument.startsWith("--baseline="));
  const manifest = buildRemediationManifest({
    agentSpec: fs.readFileSync(path.join(root, "docs/testing/agentchat-e2e-spec.md"), "utf8"),
    pageSpec: fs.readFileSync(path.join(root, "docs/testing/other-pages-e2e-spec.md"), "utf8"),
    matrix: fs.readFileSync(path.join(root, "docs/testing/e2e-remediation-matrix-2026-10-13.md"), "utf8"),
    baseline: baselineArg ? JSON.parse(fs.readFileSync(path.resolve(root, baselineArg.slice(11)), "utf8")) : null,
  });
  const outputArg = process.argv.find((argument) => argument.startsWith("--output="));
  const output = JSON.stringify(manifest, null, 2) + "\n";
  if (outputArg) {
    const destination = path.resolve(root, outputArg.slice(9));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, output);
    console.log(JSON.stringify({ output: path.relative(root, destination), counts: manifest.counts,
      releaseBlocked: remediationGateFailures(manifest).length > 0 }));
  } else process.stdout.write(output);
}
