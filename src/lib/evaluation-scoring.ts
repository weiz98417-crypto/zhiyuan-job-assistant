export type EvaluationBlockKey = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const SCORE_WEIGHTS: Record<Exclude<EvaluationBlockKey, "g">, number> = {
  a: 10,
  b: 20,
  c: 15,
  d: 15,
  e: 15,
  f: 15,
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 5) return 5;
  return Math.round(value * 10) / 10;
}

function validScore(value: string | undefined): number | null {
  if (!value) return null;
  const score = parseFloat(value);
  if (score >= 0 && score <= 5) return clampScore(score);
  return null;
}

function explicitScore(text: string): number | null {
  const markers = [
    /(?:总分|评分|得分|分数|匹配度|推荐度|准备度|策略评分|方案评分)\s*[：:]\s*([0-5](?:\.\d+)?)\s*(?:\/\s*5)?/i,
    /(?<!\d)([0-5](?:\.\d+)?)\s*\/\s*5(?!\d)/,
  ];
  for (const marker of markers) {
    const score = validScore(text.match(marker)?.[1]);
    if (score !== null) return score;
  }
  return null;
}

function isMostlyUnavailable(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return true;
  if (compact.length > 280) return false;
  return /(?:无法评估|不可评估|不能评估|无(?:法)?(?:相关)?(?:信息|数据|简历|JD)|未提供(?:简历|JD|岗位)|待提供(?:简历|JD)|缺少(?:简历|JD|岗位)|cannot evaluate|no (?:cv|resume|jd|data))/i.test(compact);
}

function ratioScore(positive: number, partial: number, negative: number): number {
  const total = positive + partial + negative;
  if (total === 0) return 3;
  const raw = (positive * 5 + partial * 3 + negative * 1.5) / total;
  return clampScore(raw);
}

function scoreCvMatch(text: string): number {
  if (isMostlyUnavailable(text)) return 0;
  const positive = (text.match(/(?:强匹配|高度匹配|完全匹配|✅\s*匹配|优势|直接证据|直接对应|可作为)/g) || []).length;
  const partial = (text.match(/(?:部分匹配|相邻经验|可迁移|隐含|可补充|建议补充|应对策略|⚠️)/g) || []).length;
  const negative = (text.match(/(?:不匹配|明显缺口|硬性缺口|待提供简历|待评估|无法证明)/g) || []).length;
  if (negative >= 3 && positive === 0 && partial === 0) return 0;
  return ratioScore(positive, partial, negative);
}

function scoreStrategyBlock(text: string, fallback = 3): number {
  if (isMostlyUnavailable(text)) return 0;
  const hasTable = /\|.+\|/.test(text);
  const hasConcretePlan = /(?:方案|策略|话术|应对|修改前|修改后|STAR|行动|结果|反思|问题|准备|故事|review|P6|P7|职级)/i.test(text);
  const hasMultipleItems = ((text.match(/\n\s*(?:\||[-*]|\d+[.、])/g) || []).length >= 3);
  if (hasTable && hasConcretePlan && hasMultipleItems) return 4;
  if (hasConcretePlan && text.length > 500) return 3.5;
  return fallback;
}

export function extractEvaluationBlockScore(text: string, blockKey: EvaluationBlockKey): number {
  const normalized = text.trim();
  if (!normalized) return 0;

  if (blockKey === "g") {
    if (/高可信度|真实活跃|可信度高|多数信号为正面/.test(normalized)) return 5;
    if (/谨慎推进|谨慎|混合信号|需警惕|需核实|信息有限/.test(normalized)) return 3;
    if (/疑似虚假|高度可疑|虚假|诈骗|严重风险/.test(normalized)) return 1;
    if (/(?:发现|存在|疑似).{0,12}(?:培训公司|收集简历|押金|收费)/.test(normalized)) return 1;
    return normalized.length > 20 ? 3 : 0;
  }

  const explicit = explicitScore(normalized);
  if (explicit !== null) return explicit;

  if (blockKey === "b") return scoreCvMatch(normalized);
  if (blockKey === "c") return scoreStrategyBlock(normalized, 3);
  if (blockKey === "e") return scoreStrategyBlock(normalized, 3.5);
  if (blockKey === "f") return scoreStrategyBlock(normalized, 3.5);
  if (isMostlyUnavailable(normalized)) return 0;
  return 3;
}

export function computeEvaluationOverallScore(blocks: Partial<Record<EvaluationBlockKey, { score: number }>>): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS) as Array<[Exclude<EvaluationBlockKey, "g">, number]>) {
    const score = blocks[key]?.score ?? 0;
    if (score <= 0) continue;
    weighted += score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? clampScore(weighted / totalWeight) : 3;
}
