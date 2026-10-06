/**
 * 信任卡档位换算收口(spec 33):词汇/公式/徽标文案的单一源在
 * knowledge/registry/band-labels.ts(与 rubric prompt 逐词一致);
 * 本模块是客户端便利转发层,不再自持映射。
 */
import { bandLabel, stateLabel, DIMENSION_LABELS, bandFromFiveScale, scoreBadge } from "@/lib/agent/knowledge/registry/band-labels";

export { bandLabel, stateLabel, DIMENSION_LABELS, bandFromFiveScale, scoreBadge };

export const REJECTION_REASON_LABELS: Record<string, string> = {
  resume_mismatch: "简历不匹配",
  position_filled: "已招满",
  salary_mismatch: "薪资不匹配",
  no_response: "流程无回应",
  other: "其他",
};

/** 复盘均值:未评分哨兵(0)不入均值;durable /10 归一为 /5 刻度后再平均(跨刻度不混算)。 */
export function averageScore(
  scores: Array<number | undefined>,
): number | null {
  const valid = scores
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score) && score > 0)
    .map((score) => (score > 5 ? Math.round(score / 2) : score));
  if (!valid.length) return null;
  return Math.round((valid.reduce((sum, score) => sum + score, 0) / valid.length) * 10) / 10;
}
