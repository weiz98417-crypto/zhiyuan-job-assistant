/* ── Agent Knowledge Base — scenario-selective injection ── */

import { ZHIYUAN_LEVELS, COMPANY_LEVEL_MAP, getLevelDescription, getCompanyLevel } from "./zhiyuan-levels";
import { findBenchmarks, formatBenchmarkForLLM } from "./salary-benchmarks";
import { findCompanyStyle, formatCompanyStyleForLLM } from "./interview-styles";
import { detectSignals, formatSignalsForLLM, JD_SIGNALS } from "./jd-signals";

export type AgentScenario = "explore" | "evaluate" | "dashboard" | "interview_prep" | "dingwei";

export interface KnowledgeContext {
  role?: string;
  company?: string;
  level?: string;
  industry?: string;
  city?: string;
  jdText?: string;
}

function section(title: string, body: string): string {
  return body ? `\n## ${title}\n\n${body}` : "";
}

/* ── Knowledge sections ── */

function zhiyuanLevelsSection(ctx?: KnowledgeContext): string {
  if (ctx?.level) {
    const desc = getLevelDescription(ctx.level);
    if (desc) return `**${ctx.level}**: ${desc}`;
  }
  const lines = ZHIYUAN_LEVELS.map(
    (l) => `- ${l.level}（${l.title}）：${l.yearsExperience}，${l.salaryRange}，${l.responsibility}`,
  );
  return lines.join("\n");
}

function companyLevelMapSection(ctx?: KnowledgeContext): string {
  if (!ctx?.company) return "";
  const level = ctx.level || "P6";
  const mapped = getCompanyLevel(ctx.company, level);
  return `${ctx.company}: ${level} → ${mapped}`;
}

function salarySection(ctx?: KnowledgeContext): string {
  return formatBenchmarkForLLM(ctx?.city, ctx?.level);
}

function interviewStyleSection(ctx?: KnowledgeContext): string {
  if (!ctx?.company) return "";
  return formatCompanyStyleForLLM(ctx.company);
}

function jdSignalsSection(ctx?: KnowledgeContext): string {
  if (!ctx?.jdText) return "";
  return formatSignalsForLLM(ctx.jdText);
}

function jdSignalsGlossary(): string {
  const byCategory = new Map<string, string[]>();
  for (const s of JD_SIGNALS) {
    const list = byCategory.get(s.category) || [];
    list.push(`\`${s.phrase}\``);
    byCategory.set(s.category, list);
  }
  const labels: Record<string, string> = {
    hours: "工作时长",
    culture: "文化/压力",
    stability: "稳定性",
    compensation: "薪酬",
    growth: "成长",
  };
  return [...byCategory.entries()]
    .map(([cat, phrases]) => `- ${labels[cat] || cat}: ${phrases.join("、")}`)
    .join("\n");
}

/* ── Main injection function ── */

export function injectKnowledge(scenario: AgentScenario, ctx?: KnowledgeContext): string {
  const parts: string[] = [];

  switch (scenario) {
    case "dingwei":
    case "explore": {
      // General market overview — zhiyuan levels + salary benchmarks
      parts.push(section("行业职级体系", zhiyuanLevelsSection(ctx)));
      parts.push(section("薪资基准", salarySection(ctx)));
      break;
    }
    case "evaluate": {
      // Full evaluation context — signals + company style + salary + levels
      if (ctx?.jdText) {
        const signals = jdSignalsSection(ctx);
        if (signals) parts.push(section("JD信号检测", signals));
      }
      if (ctx?.company) {
        const style = interviewStyleSection(ctx);
        if (style) parts.push(section("公司面试风格", style));
      }
      parts.push(section("薪资基准参考", salarySection(ctx)));
      parts.push(section("职级说明", zhiyuanLevelsSection(ctx)));
      parts.push(section("JD信号词速查", jdSignalsGlossary()));
      break;
    }
    case "dashboard": {
      // Dashboard overview — all static knowledge, compact
      parts.push(section("行业职级速查", zhiyuanLevelsSection(ctx)));
      parts.push(section("薪资基准参考", salarySection(ctx)));
      parts.push(section("JD信号词速查", jdSignalsGlossary()));
      break;
    }
    case "interview_prep": {
      // Interview-focused — company style + levels
      if (ctx?.company) {
        const style = interviewStyleSection(ctx);
        if (style) parts.push(section("公司面试风格", style));
        const levelMap = companyLevelMapSection(ctx);
        if (levelMap) parts.push(section("职级映射", `- ${levelMap}`));
      }
      parts.push(section("职级参考", zhiyuanLevelsSection(ctx)));
      break;
    }
  }

  return parts.filter(Boolean).join("\n");
}

/* ── Re-exports ── */

export {
  ZHIYUAN_LEVELS,
  COMPANY_LEVEL_MAP,
  getLevelDescription,
  getCompanyLevel,
  findBenchmarks,
  formatBenchmarkForLLM,
  findCompanyStyle,
  formatCompanyStyleForLLM,
  detectSignals,
  formatSignalsForLLM,
  JD_SIGNALS,
};
