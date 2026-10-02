/**
 * 薪资区间抽取（Spec 28 / ADR-0043 条款 2，第一方确定性路径）。
 * 从岗位 JD 文本抽「15-25K·14薪」「20-30万/年」「薪资面议」等模式，
 * 与 JD 风险引擎同一工程路数：纯正则、抽取失败留空不猜、面议单独标记。
 */

export interface SalaryExtraction {
  minMonthly: number | null;
  maxMonthly: number | null;
  /** CNY/month 规范化后的数值 */
  bonusMonths: number | null;
  negotiable: boolean;
  /** 命中的原文片段（溯源用） */
  matched: string;
}

const K_RE = /(\d+(?:\.\d+)?)\s*[-~—至]\s*(\d+(?:\.\d+)?)\s*[kK千]/;
const WAN_YEAR_RE = /(\d+(?:\.\d+)?)\s*[-~—至]\s*(\d+(?:\.\d+)?)\s*万\s*[\/每]?\s*年/;
const WAN_MONTH_RE = /(\d+(?:\.\d+)?)\s*[-~—至]\s*(\d+(?:\.\d+)?)\s*万\s*[\/每]?\s*月/;
const SINGLE_K_RE = /(\d+(?:\.\d+)?)\s*[kK千](?:\s*[\/每]?\s*月)?/;
const BONUS_RE = /[·•·]\s*(\d{2})\s*薪|(\d{2})\s*薪/;
const YUAN_MONTH_RE = /(\d{4,6})\s*[-~—至]\s*(\d{4,6})\s*元?\s*[\/每]?\s*月/;
const NEGOTIABLE_RE = /薪资面议|面议|薪资open|待遇面谈/;

/** 从 JD 文本抽取薪资区间；返回 null 表示文本中没有可解析的薪资（不猜）。 */
export function extractSalaryFromJD(jdText: string): SalaryExtraction | null {
  // 全角→半角、千分位归一（与 resume-factuality 同一归一化纪律）
  const text = (jdText || "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/\s+/g, " ");
  if (!text) return null;

  const negotiable = NEGOTIABLE_RE.test(text);

  const matchers: Array<[RegExp, (m: RegExpMatchArray) => { min: number; max: number; unit: "month" | "year" }]> = [
    [K_RE, (m) => ({ min: parseFloat(m[1]) * 1000, max: parseFloat(m[2]) * 1000, unit: "month" })],
    [WAN_MONTH_RE, (m) => ({ min: parseFloat(m[1]) * 10000, max: parseFloat(m[2]) * 10000, unit: "month" })],
    [WAN_YEAR_RE, (m) => ({ min: parseFloat(m[1]) * 10000 / 12, max: parseFloat(m[2]) * 10000 / 12, unit: "year" })],
    [YUAN_MONTH_RE, (m) => ({ min: parseFloat(m[1]), max: parseFloat(m[2]), unit: "month" })],
  ];
  for (const [re, convert] of matchers) {
    const m = text.match(re);
    if (m) {
      const { min, max, unit } = convert(m);
      const bonus = text.match(BONUS_RE);
      return {
        minMonthly: Math.round(min),
        maxMonthly: Math.round(max),
        bonusMonths: bonus ? Number(bonus[1] || bonus[2]) : null,
        negotiable: false,
        matched: m[0],
      };
    }
  }

  // 单值薪资（如 "25K"）：上下限同值
  const single = text.match(SINGLE_K_RE);
  if (single) {
    const value = Math.round(parseFloat(single[1]) * 1000);
    return { minMonthly: value, maxMonthly: value, bonusMonths: null, negotiable: false, matched: single[0] };
  }

  if (negotiable) {
    return { minMonthly: null, maxMonthly: null, bonusMonths: null, negotiable: true, matched: "薪资面议" };
  }
  return null;
}
