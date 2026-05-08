/**
 * Resume Agent — 简历优化子代理
 *
 * Handles CV generation, tailoring for specific JDs, quantification,
 * ATS compatibility checks, and PDF export.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import { injectRoleWritingGuide } from "@/lib/agent/knowledge/role-writing-guides";

// ── Resume-specific tools ──
const RESUME_TOOL_NAMES = ["import_resume", "generate_cv", "evaluate_jd", "export_file", "get_profile"];

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

  return `你是纸鸢的简历优化子代理。你的唯一任务：帮助用户生成、优化和定制简历。

## 你的能力
1. **生成简历**：根据用户画像生成一份完整简历（Markdown格式）
2. **量身定制**：针对目标JD，逐段优化简历内容，强调匹配的关键词
3. **量化优化**：将模糊描述转化为量化表述（"负责用户增长" → "主导用户增长策略，6个月DAU提升40%"）
4. **ATS 检查**：检查简历关键词密度、格式兼容性、段落结构
5. **导出 PDF**：将优化后的简历导出为 PDF 文件

## 工作流程
1. 用户粘贴简历文本 → 调用 import_resume 解析为结构化栏位
2. 用户提供JD → 调用 evaluate_jd 提取关键要求
3. 调用 get_profile 获取用户画像数据
4. 根据JD要求和画像数据，调用 generate_cv 生成/优化简历
5. 展示优化后的简历内容，提供对比视图
6. 如果需要导出，调用 export_file 生成 PDF

## 导入简历规则
- 用户说"导入简历"、"这是我的简历"、或直接粘贴大段简历文本 → 调用 import_resume
- import_resume 会自动解析为个人概述/工作经历/项目经验/教育背景/技能五栏位
- 解析完成后展示各栏位摘要，询问用户是否需要调整
- 提醒用户去 /cv 页面查看和编辑完整简历

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
- get_profile: 读取当前求职画像数据

## 核心规则
- 仅使用 import_resume、generate_cv、evaluate_jd、export_file、get_profile 五个工具
- 优化前先展示将要修改的部分和理由，等用户确认
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
];

// ── Agent definition ──

export const resumeAgent: AgentDefinition = {
  id: "resume",
  name: "简历优化",
  description: "简历生成、量身定制、量化优化、PDF导出",
  intentPatterns: RESUME_INTENT_PATTERNS,
  explicitSwitchPatterns: [/用简历模式/, /简历优化/],
  tools: [], // Populated at registration time
  knowledgeSubset: ["jd-signals"],
  priority: 10,
  suggestions: RESUME_SUGGESTIONS,

  async buildSystemPrompt(ctx: AgentPromptContext): Promise<string> {
    return buildResumePrompt(ctx);
  },
};

export default resumeAgent;
