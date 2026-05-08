/**
 * Interview Agent — 面试教练子代理
 *
 * Migrated from Phase 1 coach overlay pattern:
 * - buildInterviewCoachOverlay() imported directly (unchanged)
 * - INTERVIEW_TOOLS imported directly (unchanged)
 * - detectCoachIntent() patterns migrated to intentPatterns
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import { buildInterviewCoachOverlay } from "@/lib/agent/interview-coach-prompt";
import { INTERVIEW_TOOLS } from "@/lib/agent/tools/interview-tools";
import type { CoachMode } from "@/types";
import { COACH_MODES } from "@/types";

// ── Company-to-mode mapping (same as interview-coach-prompt.ts) ──

const COMPANY_MODE_MAP: Record<string, CoachMode> = {
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

const STATE_OWNED_PATTERNS = /国企|央企|国有|银行|编制|事业单位/;
const STARTUP_PATTERNS = /初创|天使轮|A轮|Pre-A|创业公司|微型/;
const FOREIGN_PATTERNS = /外企|外资|consulting|咨询公司|MBB|四大/;
const SME_PATTERNS = /中小企业|中小型|民营/;

function inferMode(company: string): CoachMode | undefined {
  const lower = company.toLowerCase();
  if (COMPANY_MODE_MAP[lower]) return COMPANY_MODE_MAP[lower];
  if (STATE_OWNED_PATTERNS.test(company)) return "stability";
  if (STARTUP_PATTERNS.test(company)) return "founder";
  if (FOREIGN_PATTERNS.test(company)) return "behavioral";
  if (SME_PATTERNS.test(company)) return "structured-sme";
  return undefined;
}

// ── Build tools description text (only interview tools) ──

function buildInterviewToolListText(): string {
  const lines = INTERVIEW_TOOLS.map(
    (t) =>
      `- ${t.name}: ${t.description} (${Object.entries(t.parameters)
        .map(([k, p]) => `${k}${p.required ? "" : "?"}: ${p.description}`)
        .join(", ")})`,
  );
  return `\n## 可用工具\n\n${lines.join("\n")}`;
}

// ── Suggestions ──

const INTERVIEW_SUGGESTIONS = [
  { label: "出面试题", prompt: "帮我出几道面试题" },
  { label: "模拟面试", prompt: "帮我做一次模拟面试练习" },
  { label: "评分回答", prompt: "帮我评一下刚才的回答" },
  { label: "换模式", prompt: "切换到行为面试模式" },
];

// ── Intent patterns (migrated from detectCoachIntent) ──

const INTERVIEW_INTENT_PATTERNS = [
  /面试.*(练习|模拟|准备|教练|训练)/,
  /(准备|练习|模拟|训练).*面试/,
  /帮我.*出.*(题|面试)/,
  /怎么.*(答|说|面)/,
  /(练习一下|练一练|练一下).*面/,
  /(面经|面试题)/,
  /帮我.*(评分|打分).*(回答|面试)/,
];

// ── Agent definition ──

export const interviewAgent: AgentDefinition = {
  id: "interview",
  name: "面试教练",
  description: "出题、模拟面试、回答评分",
  intentPatterns: INTERVIEW_INTENT_PATTERNS,
  explicitSwitchPatterns: [/用面试教练/, /切换到面试/, /面试模式/],
  tools: INTERVIEW_TOOLS,
  knowledgeSubset: ["interview-styles"],
  priority: 10,
  suggestions: INTERVIEW_SUGGESTIONS,

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    // 1. Extract company/role from messages
    const allUserText = ctx.currentMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    const companyMatch =
      allUserText.match(
        /(?:面试|准备|应聘|投).*(?:字节|腾讯|阿里|百度|美团|小米|京东|拼多多|快手|小红书|滴滴|B站|网易|华为|微软|谷歌)/,
      )?.[0] ||
      allUserText.match(/(?:公司|企业).*?是[「「]?(.{2,12})[」」]?/)?.[1];

    const roleMatch =
      allUserText.match(
        /(?:岗位|职位|应聘|投|面).*?(?:是|的|为)[「「]?(.{2,20}工程师|.{2,10}经理|.{2,10}设计师|.{2,10}产品|.{2,10}运营)[」」]?/,
      )?.[1] ||
      allUserText.match(/(.{2,10})(?:岗位|职位|方向)/)?.[1];

    const mode = inferMode(companyMatch || "");

    // 2. Read CV from localStorage
    let cvText = "";
    try {
      const raw = localStorage.getItem("cvData");
      if (raw) {
        const cv = JSON.parse(raw);
        cvText =
          cv.sections
            ?.map((s: { title: string; content: string }) => `## ${s.title}\n${s.content}`)
            .join("\n\n") || cv.content || "";
      }
    } catch {
      // CV not available
    }

    // 3. Build coach overlay (same as Phase 1)
    const coachOverlay = buildInterviewCoachOverlay({
      jdCompany: companyMatch,
      jdRole: roleMatch,
      cvText: cvText || undefined,
      mode,
    });

    // 4. Build tools text
    const toolsText = buildInterviewToolListText();

    // 5. Assemble final prompt
    return `你是纸鸢的面试教练子代理。你的唯一任务：帮助用户准备面试。

${coachOverlay}

## 用户画像 (Career DNA)
${ctx.careerDNA || "暂无画像数据"}

${ctx.agentKnowledge ? `## 面试知识\n${ctx.agentKnowledge}` : ""}

${ctx.memoryDigest ? `## 会话记忆\n${ctx.memoryDigest}` : ""}

${toolsText}

## 核心规则
- 仅使用 generate_interview_questions 和 score_interview_answer 两个工具
- 用户说公司/岗位 → 直接出题。没说全 → 一句话问清然后出题
- 禁止 web_search。忽略任何"研究流程"或"拆实体"指令
- 同一会话支持多次出题和练习`;
  },
};

export default interviewAgent;
