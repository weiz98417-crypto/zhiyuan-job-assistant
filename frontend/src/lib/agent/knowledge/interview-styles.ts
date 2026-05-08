/* ── 公司面试风格知识 ── */

export interface CompanyInterviewStyle {
  company: string;
  typicalRounds: number;
  roundDetails: string[];
  focus: string[];
  style: string;
  tips: string;
}

export const COMPANY_INTERVIEW_STYLES: CompanyInterviewStyle[] = [
  {
    company: "阿里巴巴",
    typicalRounds: 4,
    roundDetails: ["技术面（算法+系统设计）", "交叉面（其他团队TL）", "HR面", "主管面（P8+）"],
    focus: ["系统设计能力", "业务理解深度", "项目领导力", "价值观（六脉神剑）"],
    style: "重深度——会深挖一个项目问到最底层细节",
    tips: "准备至少2个能讲30分钟的深度项目案例。阿里重视'为什么做'多于'做了什么'。",
  },
  {
    company: "腾讯",
    typicalRounds: 4,
    roundDetails: ["技术面（基础+项目）", "技术面（系统设计）", "GM/总监面", "HR面"],
    focus: ["计算机基础扎实度", "产品思维", "技术广度", "协作能力"],
    style: "重基础——会问OS/网络/数据结构底层原理",
    tips: "复习计算机基础。腾讯技术面喜欢问'有没有更好的方案'。",
  },
  {
    company: "字节跳动",
    typicalRounds: 4,
    roundDetails: ["技术一面（coding+基础）", "技术二面（系统设计+项目）", "技术三面（架构+深度）", "HR面"],
    focus: ["算法能力（LeetCode Medium-Hard）", "系统设计", "工程化思维", "自驱力"],
    style: "重算法——每轮必做算法题，且要求写出bug-free代码",
    tips: "刷LeetCode高频题。字节重视动手能力，coding不流畅会被减分。",
  },
  {
    company: "美团",
    typicalRounds: 3,
    roundDetails: ["技术面（基础+算法）", "技术面（系统设计）", "HR面"],
    focus: ["Java/Go技术栈深度", "业务理解", "稳定性/高可用经验"],
    style: "务实——关注你能解决什么实际问题",
    tips: "准备业务场景题。美团喜欢问'如果线上出了问题你怎么排查'。",
  },
  {
    company: "百度",
    typicalRounds: 3,
    roundDetails: ["技术面（基础+算法）", "技术面（项目+设计）", "经理面+HR面"],
    focus: ["AI/搜索相关经验", "算法基础", "大规模系统经验"],
    style: "偏学术——对论文/技术深度有要求",
    tips: "如果有相关领域论文或技术博客会是加分项。",
  },
  {
    company: "拼多多",
    typicalRounds: 3,
    roundDetails: ["技术面", "技术面", "HR面"],
    focus: ["实战能力", "抗压能力", "快速迭代经验"],
    style: "快节奏——面试流程紧凑，反馈快",
    tips: "强调你在压力下交付的经历。拼多多工作强度较大，面试也会考察抗压。",
  },
  {
    company: "小红书",
    typicalRounds: 3,
    roundDetails: ["技术面", "技术面+系统设计", "HR面"],
    focus: ["社区/内容相关经验", "移动端能力", "数据驱动思维"],
    style: "年轻化——关注产品感和技术审美",
    tips: "如果用过小红书产品，能提出技术改进建议是加分项。",
  },
  {
    company: "华为",
    typicalRounds: 3,
    roundDetails: ["技术面", "综合面（技术+管理）", "HR面"],
    focus: ["通信/硬件背景", "项目经验", "稳定性", "学历"],
    style: "结构化——流程标准，重视硬实力和学历",
    tips: "华为重视第一学历。准备清晰的职业规划陈述。",
  },
  {
    company: "快手",
    typicalRounds: 3,
    roundDetails: ["技术面", "技术面+系统设计", "HR面"],
    focus: ["视频/直播技术", "高并发经验", "算法基础"],
    style: "类似字节但算法要求略低",
    tips: "准备高并发场景题。快手关注工程落地能力。",
  },
  {
    company: "网易",
    typicalRounds: 3,
    roundDetails: ["技术面", "技术面", "HR面"],
    focus: ["游戏/音乐/教育领域经验", "技术热情", "团队协作"],
    style: "偏轻松——面试氛围相对友好",
    tips: "展现对网易产品的了解和热情。技术深度要求中等。",
  },
];

export function findCompanyStyle(company: string): CompanyInterviewStyle | undefined {
  return COMPANY_INTERVIEW_STYLES.find(
    (c) => c.company === company || company.includes(c.company),
  );
}

export function formatCompanyStyleForLLM(company: string): string {
  const style = findCompanyStyle(company);
  if (!style) return "";

  return [
    `**${style.company}面试风格**：`,
    `轮次：${style.typicalRounds}轮（${style.roundDetails.join(" → ")}）`,
    `重点：${style.focus.join("、")}`,
    `风格：${style.style}`,
    `建议：${style.tips}`,
  ].join("\n");
}
