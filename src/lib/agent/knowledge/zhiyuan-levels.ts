/* ── 中国互联网行业职级体系 ── */

export interface ZhiyuanLevel {
  level: string;
  title: string;
  yearsExperience: string;
  salaryRange: string;
  responsibility: string;
}

export const ZHIYUAN_LEVELS: ZhiyuanLevel[] = [
  {
    level: "P5",
    title: "初级工程师",
    yearsExperience: "1-3年",
    salaryRange: "15K-30K",
    responsibility: "独立完成模块开发，需要指导和Code Review",
  },
  {
    level: "P6",
    title: "高级工程师",
    yearsExperience: "3-5年",
    salaryRange: "30K-50K",
    responsibility: "独立负责子系统设计，能带小项目，技术深度",
  },
  {
    level: "P7",
    title: "专家/技术专家",
    yearsExperience: "5-8年",
    salaryRange: "50K-80K",
    responsibility: "跨团队技术方案设计，技术影响力，带人",
  },
  {
    level: "P8",
    title: "资深专家/高级专家",
    yearsExperience: "8-12年",
    salaryRange: "80K-120K+",
    responsibility: "部门级技术规划，行业影响力，团队建设",
  },
  {
    level: "P9",
    title: "总监/首席专家",
    yearsExperience: "12年+",
    salaryRange: "120K-200K+",
    responsibility: "技术战略，多团队管理，行业话语权",
  },
];

/* ── 公司职级映射 ── */

export const COMPANY_LEVEL_MAP: Record<string, Record<string, string>> = {
  阿里巴巴: { P6: "P6", P7: "P7", P8: "P8", P9: "P9" },
  腾讯: { P6: "T9/T10", P7: "T11", P8: "T12", P9: "T13" },
  字节跳动: { P6: "2-1", P7: "2-2", P8: "3-1", P9: "3-2" },
  美团: { P6: "L7", P7: "L8", P8: "L9", P9: "L10" },
  百度: { P6: "T5", P7: "T6", P8: "T7", P9: "T8" },
  拼多多: { P6: "P6", P7: "P7", P8: "P8", P9: "P9" },
  京东: { P6: "T5", P7: "T6", P8: "T7", P9: "T8" },
  快手: { P6: "K3A", P7: "K3B", P8: "K4A", P9: "K4B" },
  小红书: { P6: "R5", P7: "R6", P8: "R7", P9: "R8" },
  华为: { P6: "15-16级", P7: "17-18级", P8: "19-20级", P9: "21级+" },
};

export function getLevelDescription(level: string): string {
  const found = ZHIYUAN_LEVELS.find((l) => l.level === level);
  if (!found) return "";
  return `${found.title}（${found.yearsExperience}，${found.salaryRange}）：${found.responsibility}`;
}

export function getCompanyLevel(company: string, aliLevel: string): string {
  return COMPANY_LEVEL_MAP[company]?.[aliLevel] ?? aliLevel;
}
