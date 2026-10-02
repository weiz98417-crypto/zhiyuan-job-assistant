/**
 * 公司 → 面试教练模式映射（Spec 25 单源）。
 * 此前在 interview-agent.ts 与 interview-coach-prompt.ts 各有一份逐字重复的表；
 * 现在两处都从这里导入。新增公司 = 改这一处。
 */
import type { CoachMode } from "@/types";

export const COMPANY_MODE_MAP: Record<string, CoachMode> = {
  bytedance: "project-review",
  tencent: "project-review",
  alibaba: "project-review",
  baidu: "project-review",
  meituan: "project-review",
  xiaomi: "project-review",
  jd: "project-review",
  pinduoduo: "project-review",
  kuaishou: "project-review",
  xiaohongshu: "project-review",
  didi: "project-review",
  bilibili: "project-review",
  netease: "project-review",
};

export const STATE_OWNED_PATTERNS = /国企|央企|国有|银行|编制|事业单位/;
export const STARTUP_PATTERNS = /初创|天使轮|A轮|Pre-A|创业公司|微型/;
export const FOREIGN_PATTERNS = /外企|外资|consulting|咨询公司|MBB|四大/;
export const SME_PATTERNS = /中小企业|中小型|民营/;

export function inferCoachMode(company: string): CoachMode | undefined {
  const lower = company.toLowerCase();
  if (COMPANY_MODE_MAP[lower]) return COMPANY_MODE_MAP[lower];
  if (STATE_OWNED_PATTERNS.test(company)) return "stability";
  if (STARTUP_PATTERNS.test(company)) return "founder";
  if (FOREIGN_PATTERNS.test(company)) return "behavioral";
  if (SME_PATTERNS.test(company)) return "structured-sme";
  return undefined;
}
