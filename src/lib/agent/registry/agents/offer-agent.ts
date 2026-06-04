/**
 * Offer Agent
 *
 * Owns single-offer evaluation, saved report reading, negotiation strategy,
 * HR question planning, and multi-offer comparison.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";

const OFFER_TOOL_NAMES = [
  "evaluate_offer",
  "read_offer_report",
  "generate_offer_negotiation_strategy",
  "generate_offer_hr_question_list",
  "compare_offers_deep",
  "web_search",
  "export_file",
  "download_report_pdf",
];

function buildOfferPrompt(ctx: AgentPromptContext): string {
  return `你是纸鸢的 Offer 顾问，负责录取 Offer 评估、对比和谈判辅助。

## 核心原则
- 中国求职语境优先：税前/税后、五险一金、公积金比例、试用期、用工主体、外包/派遣、加班、年终兑现、竞业和城市成本都要纳入判断。
- Offer 页面是档案和报告展示台；你是分析师和谈判顾问。
- 聊天框只输出摘要、判断和下一步，不要把完整结构化报告全文塞进对话。
- 如果已有可用报告，解释、谈判、问 HR 清单优先基于已有报告，不要重新评估。
- 只有用户明确说“重新评估/重算/按新信息再评估”，才再次调用 evaluate_offer。
- 只有用户明确说要对比两个或多个 Offer，才调用 compare_offers_deep。
- 只有用户明确要求查公司背景、市场薪资或最近情况，才允许外部搜索；否则先用本地 Offer/报告上下文。

## 工具边界
- evaluate_offer：首次或明确重新评估单个 Offer。
- read_offer_report：读取已有 Offer 报告，供解释、谈判、问 HR 使用。
- generate_offer_negotiation_strategy：基于已有报告生成谈判策略。
- generate_offer_hr_question_list：基于已有报告生成 HR 问询清单。
- compare_offers_deep：明确比较 2 个或更多 Offer。

## 对话方式
- 用户问“这个 offer 值不值得接”：评估单个 Offer。
- 用户问“那怎么谈”：基于当前 Offer/报告给谈判策略，不要重评估。
- 用户问“问 HR 什么”：基于缺失信息和红旗列清单，不要重评估。
- 用户补充关键事实：说明这会让旧报告变旧，再根据用户意图决定是否重评估。

## 用户画像
${ctx.careerDNA || "暂无用户画像数据"}`;
}

const OFFER_SUGGESTIONS = [
  { label: "评估 Offer", prompt: "帮我评估一下这个 Offer：" },
  { label: "对比 Offer", prompt: "帮我对比这几个 Offer：" },
  { label: "谈判策略", prompt: "基于这个 Offer，帮我制定谈判策略" },
  { label: "HR 问询清单", prompt: "基于这个 Offer，帮我列一份问 HR 的清单" },
];

const OFFER_INTENT_PATTERNS = [
  /(评估|分析|看看|帮我看).*(offer|Offer|OFFER|录取|薪资待遇)/i,
  /(这个|这份).*(offer|Offer|OFFER|录取).*(怎么样|如何|能不能|可以|值不值得)/i,
  /(对比|比较|选哪个).*(offer|Offer|OFFER)/i,
  /offer.*(评估|分析|对比|比较|谈判|策略)/i,
  /(谈|聊).*(薪资|待遇|offer|Offer)/i,
  /(offer|Offer|OFFER).*(谈|聊).*(HR|hr|人事|薪资|待遇)/i,
  /(offer|Offer|OFFER).*(HR|hr|人事).*(谈|聊|怎么|如何)/i,
  /(问|询问).*(HR|hr|人事).*(offer|薪资|待遇|合同|社保|公积金)/i,
  /(offer|Offer|OFFER).*(问|询问).*(HR|hr|人事|什么|哪些)/i,
  /(两个|2个|两个以上|多个).*(offer|Offer)/i,
];

export const offerAgent: AgentDefinition = {
  id: "offer",
  name: "Offer 顾问",
  description: "评估录取 Offer、Offer 对比、薪资谈判和 HR 问询清单",
  intentPatterns: OFFER_INTENT_PATTERNS,
  tools: [],
  toolNames: OFFER_TOOL_NAMES,
  knowledgeSubset: ["salary-benchmarks"],
  priority: 11,
  suggestions: OFFER_SUGGESTIONS,
  model: "deepseek-v4-flash",
  modelPro: "deepseek-v4-pro",

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    return buildOfferPrompt(ctx);
  },
};

export default offerAgent;
