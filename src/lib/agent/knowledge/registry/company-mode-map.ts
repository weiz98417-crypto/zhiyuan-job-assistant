/**
 * 公司 → 面试教练模式映射（Spec 25 单源；eng review 遗留项：13 家大厂差异化 + 二轮 S1 中文键）。
 *
 * 差异依据是各公司公开可查的面试风格共识（而非精确 内幕——面试形式随团队/年份变化，
 * 这里取的是「主流声音的众数」）：
 * - project-review（项目复盘深挖+数据追问）：字节/腾讯/阿里/百度/小米/快手/小红书/滴滴/B站——主流大厂技术/产品面的共性形态；
 * - structured-sme（结构化、标准流程、细节与即战力）：美团（结构化面试著称）、京东（流程化体系化）、拼多多（快节奏标准化高强度）；
 * - stability（稳重应答、稳定性与长期规划）：网易（文化稳重、节奏平缓的重 Screening 风格）。
 * 新公司/新认知 = 改这一处数据；模式定义见 COACH_MODES。
 *
 * 键有两套：中文名键（实际入参是中文公司名/句子片段，二轮 S1 修复——拉丁键曾全部命不中）
 * 与拉丁名键（英文输入兜底）。匹配规则见 companyModeKeyHit。
 */
import type { CoachMode } from "@/types";

export const COMPANY_MODE_MAP: Record<string, CoachMode> = {
  // 中文名键
  "字节": "project-review",
  "字节跳动": "project-review",
  "腾讯": "project-review",
  "阿里": "project-review",
  "阿里巴巴": "project-review",
  "百度": "project-review",
  "小米": "project-review",
  "快手": "project-review",
  "小红书": "project-review",
  "滴滴": "project-review",
  "b站": "project-review",
  "bilibili": "project-review",
  "网易": "stability",
  "美团": "structured-sme",
  "京东": "structured-sme",
  "拼多多": "structured-sme",
  // 拉丁名键（英文输入兜底）
  bytedance: "project-review",
  tencent: "project-review",
  alibaba: "project-review",
  baidu: "project-review",
  xiaomi: "project-review",
  kuaishou: "project-review",
  xiaohongshu: "project-review",
  didi: "project-review",
  meituan: "structured-sme",
  jd: "structured-sme",
  pinduoduo: "structured-sme",
  netease: "stability",
};

/** 中文公司键用「包含」匹配（入参常见句子片段如「准备面试字节」），拉丁键保持精确。 */
export function companyModeKeyHit(company: string, key: string): boolean {
  const lower = company.toLowerCase();
  if (/[a-z]/.test(key)) return lower === key;
  return lower.includes(key);
}

export const STATE_OWNED_PATTERNS = /国企|央企|国有|银行|编制|事业单位/;
export const STARTUP_PATTERNS = /初创|天使轮|A轮|Pre-A|创业公司|微型/;
export const FOREIGN_PATTERNS = /外企|外资|consulting|咨询公司|MBB|四大/;
export const SME_PATTERNS = /中小企业|中小型|民营/;

export function inferCoachMode(company: string): CoachMode | undefined {
  for (const [key, mode] of Object.entries(COMPANY_MODE_MAP)) {
    if (companyModeKeyHit(company, key)) return mode;
  }
  if (STATE_OWNED_PATTERNS.test(company)) return "stability";
  if (STARTUP_PATTERNS.test(company)) return "founder";
  if (FOREIGN_PATTERNS.test(company)) return "behavioral";
  if (SME_PATTERNS.test(company)) return "structured-sme";
  return undefined;
}
