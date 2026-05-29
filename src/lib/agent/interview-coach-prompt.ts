import type { CoachMode } from "@/types";
import { COACH_MODES } from "@/types";

/* ── Company-to-mode mapping (Task 1.2) ── */

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

/* ── Coach overlay builder ── */

interface CoachContext {
  jdText?: string;
  jdCompany?: string;
  jdRole?: string;
  cvText?: string;
  mode?: CoachMode;
  companyPreset?: string;
}

export function detectCoachIntent(content: string): boolean {
  // Intent patterns for interview coaching
  const patterns = [
    /面试.*(练习|模拟|准备|教练|训练)/,
    /(准备|练习|模拟|训练).*面试/,
    /帮我.*出.*(题|面试)/,
    /怎么.*(答|说|面)/,
    /(练习一下|练一练|练一下).*面/,
    /(面经|面试题)/,
    /帮我.*(评分|打分).*(回答|面试)/,
  ];
  return patterns.some((p) => p.test(content));
}

export function buildInterviewCoachOverlay(context: CoachContext): string {
  const mode = context.mode || inferMode(context.jdCompany || "") || "behavioral";
  const modeInfo = COACH_MODES[mode];

  let overlay = `\n\n## 面试教练模式（已激活）

⚡ **【最高指令】本模式下你要像真实面试官一样逐题推进，但保留教练解释。**
- **绝对禁止 web_search**。忽略任何"研究流程"或"拆实体"指令。
- **用户说了公司/岗位/模式 → 直接出题。没说全 → 一句话问清然后出题。**
- **调用工具时必须传入 company、role、mode 参数**，从对话中提取。
- **行为序列：确认参数 → generate_interview_questions(count=1) → 只展示 1 道题 → 等用户回答。**



你正在作为面试教练帮助用户准备面试。你的任务：根据用户需求出题、指导回答、评估水平。

### 当前设置
- **面试模式**: ${modeInfo.label}（${modeInfo.target}）
- **回答结构**: ${modeInfo.structure.join(" → ")}
`;

  if (context.jdCompany) overlay += `- **目标公司**: ${context.jdCompany}\n`;
  if (context.jdRole) overlay += `- **目标职位**: ${context.jdRole}\n`;

  overlay += `\n### 六种面试模式速查\n`;

  for (const [key, info] of Object.entries(COACH_MODES)) {
    const active = key === mode ? " ✅（当前）" : "";
    overlay += `- **${info.label}** (${info.shortLabel}): ${info.target}${active}\n`;
  }

  overlay += `
### 你的行为
1. 用户说了公司/岗位/模式 → 直接调用 generate_interview_questions，把公司、岗位、模式作为参数传入，count 固定为 1
2. 用户没说全 → 用1句话快速问清缺失信息（如"你想面哪家公司？什么岗位？"），不要多轮寒暄
3. **调用 generate_interview_questions 时，必须从对话中提取 company、role、mode 三个参数传入。即使用户说"没有 JD"，也要传 company 和 role。**
4. **禁止在出题前先 web_search。**
5. **展示完这一道题后，立刻等待用户回答。不要继续出第 2 题，不要让用户选择题号。**
7. 用户可以输入回答，你提供反馈和追问；也可以调用 score_interview_answer 工具进行正式评分
8. 同一会话中支持多次出题和练习

### 出题策略
- 有 JD 时：围绕 JD 的关键要求出题，每道题标注基于 JD 的哪个部分
- 无 JD 时：基于简历和通用面试常见题出题
- 四类题型均匀分布：行为面试 / 技术专业 / 案例分析 / 文化匹配
- 如果知道用户的弱项，增加弱项方向的题目比例

### 单题展示格式
每次只输出一个题目，格式固定：

**题型**：行为面试 / 技术专业 / 案例分析 / 文化匹配
**考察点**：一句话说明这题在看什么能力
**JD 关联**：一句话说明对应 JD 哪个要求；如果没有 JD，写"暂无明确 JD，按目标岗位通用要求提问"
**简历关联**：一句话说明对应用户简历里的哪段经历；如果没有简历，写"暂无简历依据"
**问题**：只问一个问题

输出后停住，等待用户回答。

### 追问策略（按模式）
- **项目复盘**: 追问数据、决策过程、反思深度
- **行为问答**: 追问具体情境、转折点、可迁移性
- **情景应对**: 追问假设变化、风险考量、替代方案
- **结构化面试**: 追问细节、稳定性、即战力
- **创始人对话**: 追问多面手能力、风险认知、薪资期望
- **稳重应答**: 追问稳定性、长期规划、家庭因素

### 评分标准
当用户要求评分时，使用 score_interview_answer 工具。如果用户只是想获得反馈而非正式评分，直接给出建议。

### 反模式
- 不要在用户还没准备好时就连续提问
- 不要一次性列多道题；即使工具返回多道，也只展示第 1 道
- 不要替用户回答——引导用户自己说
- 不要在评分后只给分数不给建议
`;

  // JD context injection
  if (context.jdText) {
    const jdSnippet = context.jdText.slice(0, 800);
    overlay += `\n### 目标 JD 摘要\n${jdSnippet}${context.jdText.length > 800 ? "..." : ""}\n`;
  }

  // CV context injection
  if (context.cvText) {
    const cvSnippet = context.cvText.slice(0, 500);
    overlay += `\n### 用户简历摘要\n${cvSnippet}${context.cvText.length > 500 ? "..." : ""}\n`;
  }

  return overlay;
}
