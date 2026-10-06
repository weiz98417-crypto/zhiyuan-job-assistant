/**
 * 视觉反测门禁的纯函数核心(spec 38):批评校验/门禁评估/基线哈希。
 * 无 IO、无依赖,供 verify-resume-visual.mjs 与单测共用。
 */
import crypto from "node:crypto";

export const REQUIRED_DIMS = ["layout_hierarchy", "density", "alignment", "color"];
export const THRESHOLD = { perDimension: 6, total: 24 };
export const REGRESSION_DROP = 2;

/** 校验视觉评审结果:四维齐、每维有有限分数。 */
export function validateCritique(parsed, dims = REQUIRED_DIMS) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  return dims.every((dim) => {
    const entry = parsed[dim];
    return entry !== null && typeof entry === "object" && !Array.isArray(entry) && Number.isFinite(entry.score);
  });
}

/**
 * 门禁评估:绝对阈值 + 同内容回归(基线同哈希且任一维跌超 REGRESSION_DROP)。
 *
 * @param {{
 *   sampleName: string,
 *   scores: Record<string, number>,
 *   baselineEntry?: { htmlHash: string, scores: Record<string, number> },
 *   htmlHash?: string,
 *   threshold?: { perDimension: number, total: number },
 *   regressionDrop?: number,
 *   dims?: string[],
 * }} params
 * @returns {{ failures: string[], total: number }}
 */
export function evaluateGates({
  sampleName,
  scores,
  baselineEntry = undefined,
  htmlHash = "",
  threshold = THRESHOLD,
  regressionDrop = REGRESSION_DROP,
  dims = REQUIRED_DIMS,
}) {
  const failures = [];
  for (const dim of dims) {
    if (scores[dim] < threshold.perDimension) {
      failures.push(`${sampleName}.${dim}=${scores[dim]} < ${threshold.perDimension}`);
    }
  }
  const total = dims.reduce((sum, dim) => sum + scores[dim], 0);
  if (total < threshold.total) failures.push(`${sampleName}.total=${total} < ${threshold.total}`);
  if (baselineEntry && baselineEntry.htmlHash === htmlHash) {
    for (const dim of dims) {
      if (typeof baselineEntry.scores[dim] === "number" && baselineEntry.scores[dim] - scores[dim] > regressionDrop) {
        failures.push(`${sampleName}.${dim} 回归:${baselineEntry.scores[dim]} → ${scores[dim]}(跌超 ${regressionDrop})`);
      }
    }
  }
  return { failures, total };
}

/** 内容哈希:去 BOM + CRLF→LF 后 sha256(跨机稳定,沿用 knowledge-drift 归一化教训)。 */
export function normalizeHash(text) {
  return crypto.createHash("sha256").update(text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"), "utf8").digest("hex");
}
