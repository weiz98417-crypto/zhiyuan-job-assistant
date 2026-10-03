/**
 * 薪资区间抽取（Spec 28 / ADR-0043 条款 2，第一方确定性路径）。
 * 从岗位 JD 文本抽「15-25K·14薪」「20-30万/年」「薪资面议」等模式，
 * 与 JD 风险引擎同一工程路数：纯正则、抽取失败留空不猜、面议单独标记。
 *
 * bug-hunt 2026-10-03 加固（误报会永久污染基准池）：
 * - 上下文约束：命中点附近（前 12 字/后 6 字）必须出现薪资语境词（薪资/月薪/年薪/待遇/薪水/报酬/薪/元/salary），
 *   否则丢弃——「10K QPS」「3-5千字」「编号50-80K」不再误判；
 * - plausibility gate：规范化月薪必须在 [2000, 300000]，且 max/min ≤ 8，范围外整体放弃（不猜）；
 * - 「N薪」奖金月数带数字边界（「102薪」不再拆出「02薪」）；
 * - 万区间歧义级联：默认按年薪解释；年薪解释低于月薪下限时改按月薪（「月薪1-2万」「薪资1-2万」都能命中）。
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

const MIN_PLAUSIBLE_MONTHLY = 2000;
const MAX_PLAUSIBLE_MONTHLY = 300000;
const MAX_MIN_RATIO = 8;
/** 命中点附近必须出现薪资语境词，否则视为非薪资数字 */
const SALARY_CONTEXT_RE = /薪资|月薪|年薪|待遇|薪水|报酬|底薪|salary|薪|元|RMB/i;

const K_RE = /(\d+(?:\.\d+)?)\s*[-~—至]\s*(\d+(?:\.\d+)?)\s*[kK千]/g;
const WAN_RE = /(\d+(?:\.\d+)?)\s*[-~—至]\s*(\d+(?:\.\d+)?)\s*万/g;
const YUAN_MONTH_RE = /(\d{4,6})\s*[-~—至]\s*(\d{4,6})\s*元?\s*[\/每]?\s*月/g;
const SINGLE_K_RE = /(\d+(?:\.\d+)?)\s*[kK千](?:\s*[\/每]?\s*月)?/g;
const BONUS_RE = /(?<!\d)(\d{1,2})薪(?!\d)/;
const NEGOTIABLE_RE = /薪资面议|面议|薪资open|待遇面谈/;

function hasSalaryContext(text: string, index: number, length: number): boolean {
  const windowStart = Math.max(0, index - 12);
  const windowEnd = Math.min(text.length, index + length + 6);
  return SALARY_CONTEXT_RE.test(text.slice(windowStart, windowEnd));
}

function plausible(minMonthly: number, maxMonthly: number): boolean {
  if (minMonthly < MIN_PLAUSIBLE_MONTHLY || maxMonthly > MAX_PLAUSIBLE_MONTHLY) return false;
  if (maxMonthly < minMonthly) return false;
  if (minMonthly > 0 && maxMonthly / minMonthly > MAX_MIN_RATIO) return false;
  return true;
}

/** 从 JD 文本抽取薪资区间；返回 null 表示文本中没有可解析的薪资（不猜）。 */
export function extractSalaryFromJD(jdText: string): SalaryExtraction | null {
  // 全角→半角、千分位归一（与 resume-factuality 同一归一化纪律）
  const text = (jdText || "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/\s+/g, " ");
  if (!text) return null;

  const negotiableHit = NEGOTIABLE_RE.test(text);

  // 范围匹配器：K/元区间恒为月薪；万区间按显式单位上下文判断（月薪前缀/「万月」→月薪；年薪→年薪；裸万→默认年薪，
  // 年薪解释低于月薪下限时级联为月薪——「薪资1-2万」按月薪解释才合理）
  const matchers: Array<[RegExp, (m: RegExpMatchArray) => { min: number; max: number; unit: "month" | "year" }]> = [
    [K_RE, (m) => ({ min: parseFloat(m[1]) * 1000, max: parseFloat(m[2]) * 1000, unit: "month" })],
    [YUAN_MONTH_RE, (m) => ({ min: parseFloat(m[1]), max: parseFloat(m[2]), unit: "month" })],
    [WAN_RE, (m) => {
      const min = parseFloat(m[1]) * 10000;
      const max = parseFloat(m[2]) * 10000;
      const index = m.index ?? 0;
      const around = text.slice(Math.max(0, index - 12), Math.min(text.length, index + m[0].length + 6));
      const explicitMonth = /月薪|薪水|[\/每]\s*月/.test(around);
      const explicitYear = /年薪/.test(around);
      if (explicitMonth || (!explicitYear && min / 12 < MIN_PLAUSIBLE_MONTHLY)) {
        return { min, max, unit: "month" };
      }
      return { min: Math.round(min / 12), max: Math.round(max / 12), unit: "year" };
    }],
  ];
  for (const [re, convert] of matchers) {
    for (const m of text.matchAll(re)) {
      if (!hasSalaryContext(text, m.index ?? 0, m[0].length)) continue;
      const { min, max, unit } = convert(m);
      const minMonthly = Math.round(min);
      const maxMonthly = Math.round(max);
      if (!plausible(minMonthly, maxMonthly)) continue;
      const bonus = text.match(BONUS_RE);
      return {
        minMonthly,
        maxMonthly,
        bonusMonths: bonus ? Number(bonus[1]) : null,
        negotiable: false,
        matched: m[0],
      };
    }
  }

  // 单值薪资（如 "月薪25K"）：必须带薪资语境（裸 "10K" 常是 QPS/TPS/star，宁缺毋滥）
  for (const m of text.matchAll(SINGLE_K_RE)) {
    if (!hasSalaryContext(text, m.index ?? 0, m[0].length)) continue;
    const value = Math.round(parseFloat(m[1]) * 1000);
    if (!plausible(value, value)) continue;
    return { minMonthly: value, maxMonthly: value, bonusMonths: null, negotiable: false, matched: m[0] };
  }

  if (negotiableHit) {
    return { minMonthly: null, maxMonthly: null, bonusMonths: null, negotiable: true, matched: "薪资面议" };
  }
  return null;
}
