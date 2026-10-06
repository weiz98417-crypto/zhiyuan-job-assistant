/**
 * 视觉反测门禁的纯函数核心(spec 38):批评校验/门禁评估/基线哈希。
 * 无 IO、无依赖,供 verify-resume-visual.mjs 与单测共用。
 */
import crypto from "node:crypto";

export const REQUIRED_DIMS = ["layout_hierarchy", "density", "alignment", "color"];
export const THRESHOLD = { perDimension: 6, total: 24 };
export const REGRESSION_DROP = 2;/** 校验视觉评审结果:四维齐、每维有有限分数。 */
export function validateCritique(parsed, dims = REQUIRED_DIMS) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  return dims.every((dim) => {
    const entry = parsed[dim];
    return entry !== null && typeof entry === "object" && !Array.isArray(entry) && Number.isFinite(entry.score);
  });
}

/**
 * 门禁评估:绝对阈值 + 基线回归(有基线即比,无论内容是否变化——模板 diff 恰恰是最需要
 * 回归检测的场景;「显著劣化即红」)。htmlHash 仅作基线档案,不作为比对条件。
 *
 * @param {{
 *   sampleName: string,
 *   scores: Record<string, number>,
 *   baselineEntry?: { htmlHash: string, scores: Record<string, number> },
 * }} params
 * @returns {{ failures: string[], total: number }}
 */
export function evaluateGates({
  sampleName,
  scores,
  baselineEntry = undefined,
}) {
  const failures = [];
  for (const dim of REQUIRED_DIMS) {
    if (scores[dim] < THRESHOLD.perDimension) {
      failures.push(`${sampleName}.${dim}=${scores[dim]} < ${THRESHOLD.perDimension}`);
    }
  }
  const total = REQUIRED_DIMS.reduce((sum, dim) => sum + scores[dim], 0);
  if (total < THRESHOLD.total) failures.push(`${sampleName}.total=${total} < ${THRESHOLD.total}`);
  if (baselineEntry) {
    for (const dim of REQUIRED_DIMS) {
      if (typeof baselineEntry.scores[dim] === "number" && baselineEntry.scores[dim] - scores[dim] > REGRESSION_DROP) {
        failures.push(`${sampleName}.${dim} 回归:${baselineEntry.scores[dim]} → ${scores[dim]}(跌超 ${REGRESSION_DROP})`);
      }
    }
  }
  return { failures, total };
}

/** 内容哈希:去 BOM + CRLF→LF 后 sha256(跨机稳定,沿用 knowledge-drift 归一化教训)。 */
export function normalizeHash(text) {
  return crypto.createHash("sha256").update(text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"), "utf8").digest("hex");
}
