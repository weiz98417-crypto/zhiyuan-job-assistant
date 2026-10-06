/**
 * 信任卡档位换算收口(spec 33):band-labels(注册表,与 rubric prompt 逐词一致)是
 * 唯一档位词源;本模块收口跨组件复用的换算逻辑——复盘页与信任卡此前各自维护一份。
 * 只做纯换算,零 React 依赖。
 */
import { bandLabel, stateLabel } from "@/lib/agent/knowledge/registry/band-labels";

export { bandLabel, stateLabel };

export const DIMENSION_LABELS: Record<string, string> = {
  structure: "结构完整度",
  specificity: "具体程度",
  highlight: "亮点突出",
  timing: "时间控制",
};

export const REJECTION_REASON_LABELS: Record<string, string> = {
  resume_mismatch: "简历不匹配",
  position_filled: "已招满",
  salary_mismatch: "薪资不匹配",
  no_response: "流程无回应",
  other: "其他",
};

/** 统一档位徽标文案。rubric.overallBand 优先(根治双刻度歧义);无 rubric 时
 *  legacy /5 直映,durable /10(值域 2-10)÷2 回 1-5 再映。裸值 2-4 双刻度歧义接受(S1 已知)。 */
export function scoreBadge(score: number, rubricBand?: number): string {
  const band = typeof rubricBand === "number"
    ? rubricBand
    : Math.max(0, Math.min(4, Math.round(score > 5 ? score / 2 : score) - 1));
  return `${bandLabel(band)} · ${band}/4`;
}

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
