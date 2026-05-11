/**
 * Eval Agent — JD 评估子代理
 *
 * Focused on JD evaluation and company analysis.
 * Only 3 tools: evaluate_jd, fetch_jd_content, web_search.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";

// ── Tool names used by this agent ──
const EVAL_TOOL_NAMES = ["evaluate_jd", "evaluate_jd_full", "fetch_jd_content", "web_search", "analyze_jd_risks", "decode_black_market_terms"];

// ── Build tools description for the 3 eval tools ──
const EVAL_TOOLS_DESC = `
## 可用工具

- evaluate_jd: 运行完整7板块JD评估引擎（A-G板块），评估职位匹配度 (jdText?: 直接粘贴的JD全文, jdUrl?: JD链接, jdScreenshot?: OCR截图base64, skipSave?: 是否跳过保存)
- fetch_jd_content: 从URL抓取JD正文内容 (url: JD页面链接)
- web_search: 搜索公司背景、行业信息、薪资水平 (query: 搜索关键词)
`;

// ── Eval-specific system prompt ──

function buildEvalPrompt(ctx: AgentPromptContext): string {
  return `你是纸鸢的JD评估子代理。你的唯一任务：帮助用户评估职位匹配度和公司情况。

## 回复规则
1. 收到JD后直接调用 evaluate_jd 工具进行评估
2. 如果用户只给链接，先用 fetch_jd_content 抓取JD内容，再调用 evaluate_jd
3. 评估完成后展示匹配度分数和各板块详情
4. 如果用户询问公司背景、薪资水平，使用 web_search 查询

## JD 评估引擎
当用户要求评估 JD 时，调用 evaluate_jd 工具。该工具运行完整的 7 板块评估引擎（A-G）：

| 板块 | 内容 |
|------|------|
| A | 职位概览：Archetype 分类、领域、职级 |
| B | 简历匹配：JD 要求逐条对照 + 缺口分析 |
| C | 职级与策略：中国职级对应、晋升策略 |
| D | 薪资与市场：薪资竞争力、五险一金 |
| E | 定制化方案：简历修改建议 |
| F | 面试准备：STAR+R 故事 |
| G | 职位合法性：风险信号分析 |

评分 1-5。4.5+ → 强烈建议投递；< 3.5 → 建议不投。
中国市场规则：薪资以 RMB 税前月薪/K 表示，关注五险一金、996/大小周、竞业限制、外包。

## 用户画像 (Career DNA)
${ctx.careerDNA || "暂无画像数据"}

${ctx.agentKnowledge ? `## 行业知识\n${ctx.agentKnowledge}` : ""}

${ctx.memoryDigest ? `## 会话记忆\n${ctx.memoryDigest}` : ""}

${EVAL_TOOLS_DESC}

## 核心规则
- 仅使用 evaluate_jd、fetch_jd_content、web_search 三个工具
- 评估完成后展示确认按钮，不自动保存
- 如果JD文本超长（>2000字），提示用户可以用OCR截图`;
}

// ── Suggestions ──

const EVAL_SUGGESTIONS = [
  { label: "评估JD", prompt: "帮我评估一个JD: " },
  { label: "分析公司", prompt: "帮我分析一下这家公司" },
  { label: "对比职位", prompt: "帮我对比一下这两个职位" },
];

// ── Intent patterns ──

const EVAL_INTENT_PATTERNS = [
  // "帮我评估这个JD" / "我要评估" / "评估一下"
  /(帮我|请|麻烦|我要|我想|我来|帮我).*(评估|分析|看看).*(JD|职位|岗位|这个|jd)/i,
  /评估.*(一下|这个|那个|JD|jd|职位|岗位)/i,
  /(看一下|看看).*(JD|jd|职位|岗位)/i,
  /这个.*(岗位|职位|JD|jd).*(怎么样|如何|好不好)/i,
  /(分析|评估).*(公司|企业|JD|jd)/i,
  /(分析|查|查一下).*(薪资|工资|待遇)/,
];

// ── Agent definition ──

export const evaluateAgent: AgentDefinition = {
  id: "evaluate",
  name: "JD 评估",
  description: "评估职位匹配度、公司分析、薪资查询",
  intentPatterns: EVAL_INTENT_PATTERNS,
  tools: [], // Populated via populateAgentTools()
  toolNames: EVAL_TOOL_NAMES,
  knowledgeSubset: ["salary-benchmarks", "zhiyuan-levels", "jd-signals"],
  priority: 10,
  suggestions: EVAL_SUGGESTIONS,

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    const { registry } = await import("@/lib/agent/tools");
    const tools = EVAL_TOOL_NAMES
      .map((name) => registry.get(name))
      .filter(Boolean);
    const toolsText = tools.length > 0
      ? `\n## 可用工具\n\n${tools.map((t) => `- ${t!.name}: ${t!.description} (${Object.entries(t!.parameters).map(([k, p]) => `${k}${p.required ? "" : "?"}: ${p.description}`).join(", ")})`).join("\n")}`
      : EVAL_TOOLS_DESC;

    return buildEvalPrompt(ctx).replace(EVAL_TOOLS_DESC, toolsText);
  },
};

export default evaluateAgent;
