/**
 * JD 信号词典（Spec 25 注册条目 data.jd-signals-glossary）。
 * 只保留词表本体作为速查 glossary 注入；此前的 detectSignals/formatSignalsForLLM
 * 检测接线从未被生产触发（无调用方传 jdText），已按 Spec 25 删除。
 * JD 风险判定走 jd-risk-service 的 risk-intel 规则引擎——两者消费语义不同，勿合并。
 */

export interface JDSignal {
  phrase: string;
  possibleMeaning: string;
  severity: "info" | "warning" | "danger";
  category: "hours" | "culture" | "stability" | "compensation" | "growth";
}

export const JD_SIGNALS: JDSignal[] = [
  // 工作时长相关
  { phrase: "抗压能力强", possibleMeaning: "可能高强度工作/加班文化", severity: "warning", category: "hours" },
  { phrase: "结果导向", possibleMeaning: "可能KPI压力大，考核严格", severity: "warning", category: "culture" },
  { phrase: "弹性工作", possibleMeaning: "可能随时响应需求，无明确工作边界", severity: "warning", category: "hours" },
  { phrase: "拥抱变化", possibleMeaning: "可能组织架构/业务方向频繁调整", severity: "warning", category: "stability" },
  { phrase: "创业心态", possibleMeaning: "可能需要承担额外职责，节奏快", severity: "warning", category: "culture" },
  { phrase: "大小周", possibleMeaning: "每周工作6天，加班文化明确", severity: "danger", category: "hours" },
  { phrase: "996", possibleMeaning: "早9到晚9，每周6天", severity: "danger", category: "hours" },
  { phrase: "007", possibleMeaning: "随时待命，无固定休息", severity: "danger", category: "hours" },
  { phrase: "狼性文化", possibleMeaning: "强竞争、高淘汰、业绩导向", severity: "danger", category: "culture" },
  { phrase: "快速迭代", possibleMeaning: "节奏快，需求频繁变更", severity: "warning", category: "hours" },

  // 薪酬相关
  { phrase: "薪资open", possibleMeaning: "范围不明确，需面试时确认", severity: "info", category: "compensation" },
  { phrase: "期权/股票激励", possibleMeaning: "可能有较大增值空间，但流动性和确定性不足", severity: "info", category: "compensation" },
  { phrase: "年终奖丰厚", possibleMeaning: "需确认是固定还是浮动，浮动可能取决于绩效", severity: "info", category: "compensation" },
  { phrase: "薪资面议", possibleMeaning: "通常偏低或偏高，需通过面试了解真实范围", severity: "warning", category: "compensation" },

  // 稳定性相关
  { phrase: "试用期6个月", possibleMeaning: "试用期较长，转正前保障有限", severity: "info", category: "stability" },
  { phrase: "外包", possibleMeaning: "非本部编制，福利和稳定性差于正式员工", severity: "danger", category: "stability" },
  { phrase: "劳务派遣", possibleMeaning: "与第三方签合同，非目标公司正式员工", severity: "danger", category: "stability" },
  { phrase: "天使轮/A轮", possibleMeaning: "早期创业公司，风险和回报都高", severity: "info", category: "stability" },
  { phrase: "即将上市", possibleMeaning: "可能有机会但时间不确定，需评估期权行权条件", severity: "info", category: "stability" },

  // 成长相关
  { phrase: "扁平化管理", possibleMeaning: "可能层级少但晋升通道不清晰", severity: "info", category: "growth" },
  { phrase: "从0到1", possibleMeaning: "新业务或新团队，机会大但不确定性高", severity: "info", category: "growth" },
  { phrase: "技术驱动", possibleMeaning: "可能技术文化好，但需确认是否真的以技术为核心", severity: "info", category: "growth" },
  { phrase: "核心团队", possibleMeaning: "重要度高但压力可能也大", severity: "info", category: "growth" },
];
