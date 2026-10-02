/**
 * 评估 A-G 权重单源（Spec 25）。
 * 载体是 modes/scoring-dimensions.yml（文件头声明它是 ALL modes 的唯一事实源）；
 * 此前 evaluation-scoring.ts 里另有一份硬编码 SCORE_WEIGHTS，现在改读这里。
 * 服务端模块：文件缺失直接抛错（沿 Spec 14 显式失败哲学，不做静默 fallback）。
 */
import { loadRegistryYaml } from "./loader";

export type EvaluationBlockKey = "a" | "b" | "c" | "d" | "e" | "f" | "g";

export type ScoreWeights = Record<Exclude<EvaluationBlockKey, "g">, number>;

interface ScoringDimensionsYml {
  version: string;
  dimensions: Array<{ id: string; key: string; weight: number }>;
}

let cached: ScoreWeights | null = null;

export function getEvaluationScoreWeights(): ScoreWeights {
  if (cached) return cached;
  const doc = loadRegistryYaml<ScoringDimensionsYml>("data.scoring-dimensions");
  const byId = new Map(doc.dimensions.map((d) => [d.id.toLowerCase(), d.weight]));
  const required: Array<Exclude<EvaluationBlockKey, "g">> = ["a", "b", "c", "d", "e", "f"];
  const missing = required.filter((key) => !byId.has(key));
  if (missing.length > 0) {
    throw new Error(`scoring-dimensions.yml 缺少板块权重: ${missing.join(", ")}`);
  }
  cached = Object.fromEntries(required.map((key) => [key, byId.get(key)!])) as ScoreWeights;
  return cached;
}

/** 测试专用：清空模块级缓存（yml 内容在测试中被替换时使用）。 */
export function resetEvaluationScoreWeightsCache(): void {
  cached = null;
}
