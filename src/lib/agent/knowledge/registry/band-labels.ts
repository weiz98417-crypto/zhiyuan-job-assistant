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
