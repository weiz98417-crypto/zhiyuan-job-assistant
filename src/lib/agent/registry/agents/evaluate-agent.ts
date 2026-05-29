/**
 * Eval Agent — JD 评估子代理
 *
 * Focused on JD evaluation, risk detection, company analysis, and report management.
 * Agent soul is in agent.md; .ts is registry entry + tool description.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";

// ── Tool names ──
const EVAL_TOOL_NAMES = ["evaluate_jd_full", "get_recent_jd_context", "read_file", "get_profile", "fetch_jd_content", "analyze_jd_risks", "decode_black_market_terms", "get_report_detail", "update_report_metadata", "export_file", "download_report_pdf"];

// ── Build system prompt from agent.md + context ──

// ── Fallback prompt (used when agent.md is unavailable, e.g. client-side) ──

function fallbackEvalPrompt(ctx: AgentPromptContext): string {
  return `你是纸鸢的 JD 评估专家。你的唯一任务：帮用户评估职位匹配度。目标：让用户在 5 分钟内知道这个岗位值不值得投。

## 对话风格
- 直接给结论（投/不投/谨慎），再给理由
- 中文自然表达，不要翻译腔
- 匹配度差时直说"不建议投"，不拐弯

## 工具使用策略
- evaluate_jd_full: 收到 JD 后直接调用，不要先问"确定要评估吗"
- get_recent_jd_context: 用户说"这份JD/刚才的JD/上面的JD"但本轮没贴 JD 时，先读最近保存的 JD；如果用户消息里有 jdId=数字，必须把 jdId 传给工具；不要抓网页
- read_file(path="我的简历") / get_profile: 用户说"结合我的简历"时必须先读取简历，再评估；不要说没收到简历
- update_report_metadata: 用户要修改/补充已保存报告的公司、岗位、标题、关键词、风险备注时使用；这只是改保存信息，不重新评估
- get_report_detail + export_file: 用户说"下载报告"时用
- download_report_pdf: 用户说"导出PDF"时用
- fetch_jd_content: 只有用户本轮明确给了 http/https 链接时才用
- 禁止 web_search: JD 评估 Agent 不主动联网搜索；公开信息查询交给信息查询流程

## JD 评估引擎（A-G 7 维）
| 板块 | 内容 | 权重 |
|------|------|------|
| A | 职位概览 | 10% |
| B | 简历匹配 | 20% |
| C | 职级与策略 | 15% |
| D | 薪资与市场 | 15% |
| E | 定制化方案 | 15% |
| F | 面试准备 | 15% |
| G | 职位合法性 | 10% |

评分 1-5。4.5+ → 建议投递；< 3.5 → 建议不投。

## 边界
- 不要反复追问用户"你确定要评估吗"，收到 JD 直接评估
- 用户说"这是字节的JD""公司改成X""补进已保存报告""修改报告信息"时，先用 update_report_metadata。除非用户明确说"重新评估/重新打分/重跑"，否则禁止调用 evaluate_jd_full
- 用户说"结合我的简历"时，必须先 read_file(path="我的简历") 或 get_profile；读不到才向用户要简历
- 用户说"这个JD/刚才那个JD"时，必须先 get_recent_jd_context 或 get_report_detail；读不到才向用户要 JD
- 不要帮用户写简历（那是简历 agent 的事）
- 不要做面试模拟（那是面试 agent 的事）

## 用户画像 (Career DNA)
${ctx.careerDNA || "暂无画像数据"}`;
}

async function buildEvalPrompt(ctx: AgentPromptContext): Promise<string> {
  // Try loading from agent.md (server-side); fall back to hardcoded prompt
  try {
    const { loadAgentMD } = await import("@/lib/agent/load-agent-md");
    const soul = loadAgentMD("evaluate");

    const parts = [
      soul.body,
      "",
      "## 用户画像 (Career DNA)",
      ctx.careerDNA || "暂无画像数据",
      "",
    ];

    if (ctx.agentKnowledge) parts.push("## 行业知识", ctx.agentKnowledge, "");
    if (ctx.memoryDigest) parts.push("## 会话记忆", ctx.memoryDigest, "");

    // Inject available resources
    try {
      const reportsRes = await fetch("http://localhost:3000/api/data/reports").catch(() => null);
      if (reportsRes?.ok) {
        const reportsJson = await reportsRes.json();
        if (reportsJson.success && Array.isArray(reportsJson.data)) {
          const recent = reportsJson.data.slice(0, 5) as Array<{ report_num: number; company: string; role: string; date: string }>;
          if (recent.length) {
            parts.push("## 最近报告", `使用 get_report_detail(reportNum=N) 读取。编号列表: ${recent.map(r => `#${r.report_num} ${r.company}-${r.role}`).join(", ")}`, "");
          }
        }
      }
    } catch { /* non-blocking */ }

    const { registry } = await import("@/lib/agent/tools");
    const toolDescs = EVAL_TOOL_NAMES
      .map((name) => {
        const t = registry.get(name);
        if (!t) return null;
        const params = Object.entries(t.parameters)
          .map(([k, p]) => k + (p.required ? "" : "?"))
          .join(", ");
        return "- " + t.name + ": " + t.description + (params ? " (" + params + ")" : "");
      })
      .filter(Boolean)
      .join("\n");

    if (toolDescs) parts.push("## 可用工具", "", toolDescs);

    return parts.join("\n");
  } catch {
    return fallbackEvalPrompt(ctx);
  }
}

// ── Suggestions ──

const EVAL_SUGGESTIONS = [
  { label: "评估JD", prompt: "帮我评估一个JD: " },
  { label: "分析公司", prompt: "帮我分析一下这家公司" },
  { label: "对比职位", prompt: "帮我对比一下这两个职位" },
  { label: "下载报告", prompt: "帮我下载最近一份评估报告为Markdown" },
];

// ── Intent patterns ──

const EVAL_INTENT_PATTERNS = [
  /(帮我|请|麻烦|我要|我想|我来|帮我).*(评估|分析|看看).*(JD|职位|岗位|这个|jd)/i,
  /评估.*(一下|这个|那个|JD|jd|职位|岗位)/i,
  /(看一下|看看).*(JD|jd|职位|岗位)/i,
  /这个.*(岗位|职位|JD|jd).*(怎么样|如何|好不好)/i,
  /(分析|评估).*(公司|企业|JD|jd)/i,
  /(分析|查|查一下).*(薪资|工资|待遇)/,
  /(下载|导出|保存|输出).*(报告|评估|PDF|pdf|md|markdown)/,
  /(修改|更正|更新|补充|改成|改为).*(报告|评估|公司|岗位|JD|jd)/,
  /(公司|岗位).*(是|改成|改为).*(报告|JD|jd|评估)/,
  /(报告|评估).*(公司|岗位).*(是|改成|改为|补充|更新)/,
  /(结合|根据|基于).*(我的)?(简历|CV|履历).*(评估|分析).*(JD|jd|职位|岗位|这个|这份)/,
  /(评估|分析).*(这个|这份|刚才|上面|之前).*(JD|jd|职位|岗位)/,
  /(报告|评估).*(导出|下载|PDF|pdf)/,
  /(看|查看|展开|打开|显示).*(完整|详细|全部|全文).*(报告|评估)/,
  /(完整|详细|全部).*(报告|评估)/,
  /报告.*(展开|打开|查看)/,
];

// ── Agent definition ──

export const evaluateAgent: AgentDefinition = {
  id: "evaluate",
  name: "JD 评估",
  description: "评估职位匹配度、公司分析、薪资查询",
  intentPatterns: EVAL_INTENT_PATTERNS,
  tools: [],
  toolNames: EVAL_TOOL_NAMES,
  knowledgeSubset: ["salary-benchmarks", "zhiyuan-levels", "jd-signals"],
  priority: 10,
  suggestions: EVAL_SUGGESTIONS,
  model: "deepseek-v4-flash",
  modelPro: "deepseek-v4-pro",

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    return buildEvalPrompt(ctx);
  },
};

export default evaluateAgent;
