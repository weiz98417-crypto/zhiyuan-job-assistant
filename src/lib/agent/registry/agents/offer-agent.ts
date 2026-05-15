/**
 * Offer Agent — Offer 评估子代理
 *
 * Single offer evaluation + multi-offer comparison. Loads oferta/ofertas
 * mode frameworks and guides LLM through structured analysis.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";

const OFFER_TOOL_NAMES = ["evaluate_offer", "compare_offers_deep", "export_file", "download_report_pdf"];

function buildOfferPrompt(ctx: AgentPromptContext): string {
  return `你是纸鸢的 Offer 评估专家。你的唯一任务：帮用户评估和对比录取 Offer。

## 核心原则
- 从薪资/福利/成长/稳定性/法律 5 个维度分析
- 中国市场规则：税前vs税后、五险一金基数比例、公积金、13薪/14薪、竞业限制、试用期
- 薪资以 RMB 税前月薪/K 表示
- 直接给结论和建议，不拐弯

## 工具
- evaluate_offer: 用户发来单个 offer → 结构化评估
- compare_offers_deep: 用户发来 2+ 个 offer → 6 维度对比 + 加权推荐
- export_file: 用户说"下载""导出"→ 导出评估结果为 Markdown
- download_report_pdf: 用户说"导出PDF"→ 导出为 PDF

## 流程
1. 用户发来 offer → 直接调工具，不要先问"确定要评估吗"
2. 工具返回框架 → 你按框架逐项分析
3. 给出明确建议：接受/谈判/拒绝

## 边界
- 不做 JD 评估（那是 JD 评估 agent 的事）
- 不做简历优化（那是简历 agent 的事）
- 不主动读用户简历或画像

## 用户画像
${ctx.careerDNA || "暂无画像数据"}`;
}

const OFFER_SUGGESTIONS = [
  { label: "评估Offer", prompt: "帮我评估一下这个Offer: " },
  { label: "对比Offer", prompt: "帮我对比一下这两个Offer" },
];

const OFFER_INTENT_PATTERNS = [
  /(评估|分析|看看|帮我看).*(offer|Offer|OFFER|录取|薪资待遇)/i,
  /(这个|这份).*(offer|Offer|OFFER|录取).*(怎么样|如何|能不能|可以)/i,
  /(对比|比较|选哪个).*(offer|Offer|OFFER)/i,
  /offer.*(评估|分析|对比)/i,
  /(谈|聊).*(薪资|待遇|offer)/i,
  /offer.*(谈判|策略)/i,
  /(两个|2个|两个以上|多个).*(offer|Offer)/i,
];

export const offerAgent: AgentDefinition = {
  id: "offer",
  name: "Offer 评估",
  description: "评估录取Offer、Offer对比、薪资谈判分析",
  intentPatterns: OFFER_INTENT_PATTERNS,
  tools: [],
  toolNames: OFFER_TOOL_NAMES,
  knowledgeSubset: ["salary-benchmarks"],
  priority: 11, // Higher than evaluate (10) so "评估offer" matches offer agent first
  suggestions: OFFER_SUGGESTIONS,
  model: "deepseek-v4-flash",
  modelPro: "deepseek-v4-pro",

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    return buildOfferPrompt(ctx);
  },
};

export default offerAgent;
