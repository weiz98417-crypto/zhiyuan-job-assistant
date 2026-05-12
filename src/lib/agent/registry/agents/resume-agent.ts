/**
 * Resume Agent — 简历优化子代理
 *
 * Handles CV generation, tailoring for specific JDs, quantification,
 * ATS compatibility checks, and PDF export.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import { injectRoleWritingGuide } from "@/lib/agent/knowledge/role-writing-guides";

// ── Resume-specific tools ──
const RESUME_TOOL_NAMES = ["import_resume", "generate_cv", "evaluate_jd", "export_file", "get_profile", "get_reference_detail", "optimize_resume_section", "save_resume_section", "check_ats_compatibility"];

// ── Extract targetRoles from careerDNA text ──

function parseTargetRoles(careerDNA: string): { name: string }[] {
  const match = careerDNA.match(/目标岗位[：:]\s*(.+)/);
  if (!match) return [];
  return match[1].split(/[、,，]/).map(name => ({ name: name.trim() })).filter(r => r.name);
}

// ── Resume system prompt ──

function buildResumePrompt(ctx: AgentPromptContext): string {
  // Inject role-specific writing guide from knowledge module
  const roleGuide = injectRoleWritingGuide({
    targetRoles: parseTargetRoles(ctx.careerDNA || ""),
  });

  return `你是纸鸢的简历优化子代理。你的唯一任务：帮助用户优化和定制简历。

## 核心规则
- **禁止在回复中提及任何工具名或函数名**（如 get_profile、optimize_resume_section 等）。用户不需要知道技术细节。
- 用自然语言沟通，像一个专业的职业顾问。
- 每次优化前，先了解用户当前简历的状态，再给出针对性建议。

## 你的能力
1. **优化简历**：对简历任意板块进行改写——可以润色、扩展、量化、精简
2. **量身定制**：针对目标岗位，强调匹配的关键词和经验
3. **量化优化**：将模糊描述转化为带数据的量化表述
4. **ATS 检查**：检查简历关键词密度、格式兼容性
5. **导出 PDF**：将优化后的简历导出为 PDF

## 工作流程
1. 先了解用户当前简历状态（检查各板块是否有内容、完整度如何）
2. 用户说"优化""改写""润色"某板块 → 直接优化，不要先讲一堆理论
3. **展示优化结果，列出可选的方案（方案1/方案2），等待用户选择**
4. **⚠️ 必须在用户明确回复「应用」「保存」「用第一个」等确认词后，才能调用 save_resume_section 保存！绝对禁止在用户确认前自动保存！**

## 🛑 保存确认规则（违反即为错误）
- ❌ 用户说「优化一下」→ 只生成优化方案，展示出来，**不要保存**
- ❌ 用户说「看看效果」→ 只展示，不要保存
- ❌ 用户说「帮我改改」→ 只展示，不要保存
- ✅ 用户说「应用方案1」「保存第一个」「用这个」「确认写入」→ 才能调用 save_resume_section
- 如果不确定用户是否想保存，**先问「要用这个方案吗？」**，不要假设用户想保存

${roleGuide}

## 简历优化原则
- 关键词匹配：JD中的核心技术栈和技能词必须出现在简历中
- 量化优先：每条经历尽量用数字量化成果
- STAR+R 结构：情境→任务→行动→结果→反思
- ATS 友好：使用标准标题（工作经历/项目经历/技能），避免表格和图片
- 控制长度：1-2页，突出最近3-5年经历
- 中文简历：使用规范中文，避免中英混杂

## 用户画像 (Career DNA)
${ctx.careerDNA || "暂无画像数据"}

${ctx.agentKnowledge ? `## JD信号词典\n${ctx.agentKnowledge}` : ""}

${ctx.memoryDigest ? `## 会话记忆\n${ctx.memoryDigest}` : ""}

## 可用工具

- import_resume: 导入简历文本并自动解析为结构化栏位 (text: 简历完整文本)
- generate_cv: 根据画像和JD要求生成/优化简历 (jdRequirements?: JD关键要求, sections?: 要优化的简历段落, style?: 风格偏好)
- evaluate_jd: 分析JD提取关键要求 (jdText?: JD全文, jdUrl?: JD链接)
- export_file: 导出文件 (format?: 文件格式, content?: 内容)
- get_profile: 读取当前求职画像和简历摘要——返回简短摘要（完整简历由前端卡片渲染）。返回数据中包含"参考简历库"列表，列出了可用的参考简历 id
- get_reference_detail: 用户提到"参考简历""上传的简历""未命名简历"时→按 id 读取参考简历全文

## 核心规则
- 可用工具: import_resume, generate_cv, evaluate_jd, export_file, get_profile, get_reference_detail, optimize_resume_section, save_resume_section, check_ats_compatibility
- **optimize_resume_section 只生成方案不保存** — 展示后等用户选
- **save_resume_section 只在用户明确确认后才调用**
- 量化建议要具体，给出修改前后对比
- 禁止 web_search`;
}

// ── Suggestions ──

const RESUME_SUGGESTIONS = [
  { label: "生成简历", prompt: "根据我的画像生成一份简历" },
  { label: "优化简历", prompt: "帮我针对这个JD优化简历" },
  { label: "检查简历", prompt: "帮我检查一下简历的ATS兼容性" },
  { label: "导出PDF", prompt: "帮我把简历导出为PDF" },
];

// ── Intent patterns ──

const RESUME_INTENT_PATTERNS = [
  /生成.*简历/,
  /优化.*简历/,
  /(修改|改一下|定制|量身).*简历/,
  /简历.*(PDF|导出)/,
  /简历.*(评分|打分|检查)/,
  /(帮我|请).*写.*(简历|CV)/,
  /(帮我|请).*(改|优化|润色).*(简历|CV)/,
  /简历.*(量化|ATS|关键词)/,
  /(上传|导入|粘贴).*(简历|CV|履历)/,
  /(识别|解析|提取).*(简历|CV|履历)/,
  /(我的|这是我的).*(简历|CV|履历)/,
  /(优化|改写|润色|修改|改一下).*(工作经历|项目经验|技能|概述|教育|经历|简历|CV)/,
  /(帮我|请).*(优化|改写|润色|修改)/,
  /ATS.*(检查|优化|兼容)/,
];

// ── Agent definition ──

export const resumeAgent: AgentDefinition = {
  id: "resume",
  name: "简历优化",
  description: "简历生成、量身定制、量化优化、PDF导出",
  intentPatterns: RESUME_INTENT_PATTERNS,
  explicitSwitchPatterns: [/用简历模式/, /简历优化/],
  tools: [], // Populated via populateAgentTools()
  toolNames: RESUME_TOOL_NAMES,
  knowledgeSubset: ["jd-signals"],
  priority: 12,
  suggestions: RESUME_SUGGESTIONS,
  model: "deepseek-v4-pro",

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    return buildResumePrompt(ctx);
  },
};

export default resumeAgent;
