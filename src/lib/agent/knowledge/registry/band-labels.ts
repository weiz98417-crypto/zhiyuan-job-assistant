/**
 * 评分锚定词映射（Spec 30 / WP2）：0-4 档位 → 锚定词，与 rubric prompt 逐词一致
 * （0=未作答 / 1=薄弱 / 2=基础 / 3=扎实 / 4=出色）。前端渲染主显锚定词+档位，不再显示 X/5。
 * 三态徽标文案也在此收口（does_not_know=不会 / did_not_articulate=没说清 / not_on_resume=简历没写）。
 */

export const BAND_LABELS: Record<number, string> = {
  0: "未作答",
  1: "薄弱",
  2: "基础",
  3: "扎实",
  4: "出色",
};

export function bandLabel(band: number): string {
  return BAND_LABELS[band] || `档位 ${band}`;
}

export const STATE_LABELS: Record<string, string> = {
  does_not_know: "不会",
  did_not_articulate: "没说清",
  not_on_resume: "简历没写",
};

export function stateLabel(state: string): string | null {
  if (state === "none" || !state) return null;
  return STATE_LABELS[state] || null;
}

/** 复盘页逐题行徽标：`扎实 · 3/4` 形态（档位制主显，无 X/5）。 */
export function bandBadge(band: number): string {
  return `${bandLabel(band)} · ${band}/4`;
}

/** 评分维度词(spec 33:信任卡与复盘共用的单一源;客户端 band-scale 转发)。 */
export const DIMENSION_LABELS: Record<string, string> = {
  structure: "结构完整度",
  specificity: "具体程度",
  highlight: "亮点突出",
  timing: "时间控制",
};

/** /5 刻度分 → 档位(0-4):durable /10 已由调用方先归一;裸值 2-4 双刻度歧义接受(S1 已知)。 */
export function bandFromFiveScale(score: number): number {
  return Math.max(0, Math.min(4, Math.round(score) - 1));
}

/** 统一档位徽标文案:rubric 档位优先,无 rubric 走 /5→档位映射。 */
export function scoreBadge(score: number, rubricBand?: number): string {
  const band = typeof rubricBand === "number"
    ? rubricBand
    : bandFromFiveScale(score > 5 ? score / 2 : score);
  return `${bandLabel(band)} · ${band}/4`;
}
