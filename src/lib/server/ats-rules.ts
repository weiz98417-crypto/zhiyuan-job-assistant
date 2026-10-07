/**
 * ATS 确定性规则（Spec 24）。
 *
 * 联系方式格式、板块完整性、日期与特殊字符格式风险三类可规则化检查不再交给 LLM；
 * 量化覆盖与岗位关键词两个语义维度保留 LLM 判断（ats-analysis-service 合并两路结果）。
 */

export interface ATSIssue {
  dimension: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  fix: string;
}

export interface AtsRulesInput {
  cvText: string;
  /** 目标岗位关键词（可选；为空时跳过关键词覆盖的规则路提示） */
  keywords?: string[];
}

const SECTION_HINTS: Array<{ label: string; pattern: RegExp }> = [
  { label: "个人概述/Summary", pattern: /(个人概述|个人总结|自我评价|专业概述|summary)/i },
  { label: "工作经历/Experience", pattern: /(工作经历|实习经历|职业经历|experience)/i },
  { label: "项目经验/Projects", pattern: /(项目经验|项目经历|projects?)/i },
  { label: "教育背景/Education", pattern: /(教育背景|教育经历|education)/i },
  { label: "技能/Skills", pattern: /(技能|专业技能|核心技术|skills?)/i },
];

const PHONE_RE = /(?:\+?86[-\s]?)?1[3-9]\d{9}|\d{3,4}-\d{7,8}/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** 日期格式不一致检测：同一份简历里混用 2023.01 / 2023-01 / 2023年1月 等风格。 */
function detectDateStyleInconsistency(cvText: string): string | null {
  const dot = (cvText.match(/\d{4}\.\d{1,2}/g) || []).length;
  const dash = (cvText.match(/\d{4}-\d{1,2}/g) || []).length;
  const cn = (cvText.match(/\d{4}年\d{1,2}月/g) || []).length;
  const slash = (cvText.match(/\d{4}\/\d{1,2}/g) || []).length;
  const styles = [dot, dash, cn, slash].filter((count) => count > 0);
  if (styles.filter((count) => count > 0).length >= 2 && Math.max(...styles) >= 1) {
    const dominant = Math.max(...styles);
    const minor = styles.reduce((sum, count) => sum + count, 0) - dominant;
    if (minor >= 1 && dominant >= 2) return `存在 ${minor} 处日期风格与主流写法不一致`;
  }
  return null;
}

const SUSPICIOUS_CHARS: Array<{ chars: string; label: string }> = [
  { chars: "​​‎﻿", label: "不可见字符（零宽/双向控制符）" },
  { chars: "★☆●◆■▲", label: "装饰符号（部分 ATS 解析为乱码）" },
];

export function runDeterministicAtsRules(input: AtsRulesInput): ATSIssue[] {
  const cvText = (input.cvText || "").replace(/\r/g, "");
  const issues: ATSIssue[] = [];

  // 1. 联系方式格式
  if (!PHONE_RE.test(cvText)) {
    issues.push({ dimension: "联系方式", severity: "critical", detail: "未检测到手机号或座机（支持 11 位手机号与 0xx-xxxxxxx 座机格式）", fix: "在简历顶部联系方式区补充可解析的电话号码" });
  }
  if (!EMAIL_RE.test(cvText)) {
    issues.push({ dimension: "联系方式", severity: "critical", detail: "未检测到电子邮箱", fix: "补充常用邮箱，避免使用企业内网邮箱" });
  }

  // 2. 板块完整性
  const missingSections = SECTION_HINTS.filter((section) => !section.pattern.test(cvText));
  if (missingSections.length >= 3) {
    issues.push({
      dimension: "板块完整性",
      severity: "critical",
      detail: `缺少 ${missingSections.length} 个核心板块：${missingSections.map((s) => s.label).join("、")}`,
      fix: "补齐概述/经历/项目/教育/技能标准板块标题，ATS 依赖标题分栏",
    });
  } else if (missingSections.length > 0) {
    issues.push({
      dimension: "板块完整性",
      severity: "warning",
      detail: `未检测到板块标题：${missingSections.map((s) => s.label).join("、")}`,
      fix: "使用标准板块标题（工作经历/项目经验/教育背景/技能）",
    });
  }

  // 3. 格式风险
  const dateProblem = detectDateStyleInconsistency(cvText);
  if (dateProblem) {
    issues.push({ dimension: "格式风险", severity: "warning", detail: dateProblem, fix: "统一日期写法（如全部使用 2023.01 或 2023-01）" });
  }
  for (const { chars, label } of SUSPICIOUS_CHARS) {
    const count = [...cvText].filter((ch) => chars.includes(ch)).length;
    if (count > 0) {
      issues.push({ dimension: "格式风险", severity: "warning", detail: `检测到 ${count} 个${label}`, fix: "删除装饰性或不可见字符后重新导出" });
    }
  }
  if (/https?:\/\/\S{80,}/.test(cvText)) {
    issues.push({ dimension: "格式风险", severity: "info", detail: "存在超长 URL，可能破坏版面解析", fix: "使用短链接或仅在技能区保留域名" });
  }

  return issues;
}

/** 规则路扣分：critical -18，warning -8，info -3；下限 0。与 LLM 两维得分合并时使用。 */
export function atsRulesPenalty(issues: ATSIssue[]): number {
  return issues.reduce((penalty, issue) =>
    penalty + (issue.severity === "critical" ? 18 : issue.severity === "warning" ? 8 : 3), 0);
}
