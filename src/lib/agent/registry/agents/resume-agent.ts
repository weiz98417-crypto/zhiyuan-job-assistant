/**
 * Resume Agent — 简历优化子代理
 *
 * Handles CV generation, tailoring for specific JDs, quantification,
 * ATS compatibility checks, and PDF export.
 */
import type { AgentDefinition, AgentPromptContext } from "@/lib/agent/registry/types";
import { injectRoleWritingGuide } from "@/lib/agent/knowledge/role-writing-guides";

// ── Resume-specific tools ──
const RESUME_TOOL_NAMES = ["read_file", "import_resume", "generate_cv", "evaluate_jd", "export_file", "get_reference_detail", "optimize_resume_section", "save_resume_section", "save_reference_resume", "check_ats_compatibility"];

// ── Extract targetRoles from careerDNA text ──

function parseTargetRoles(careerDNA: string): { name: string }[] {
  const match = careerDNA.match(/目标岗位[：:]\s*(.+)/);
  if (!match) return [];
  return match[1].split(/[、,，]/).map(name => ({ name: name.trim() })).filter(r => r.name);
}

// ── Resume system prompt ──

async function buildResumePrompt(ctx: AgentPromptContext): Promise<string> {
  // Load soul from agent.md
  const { loadAgentMD } = await import("@/lib/agent/load-agent-md");
  const soul = loadAgentMD("resume");

  // Role-specific writing guide
  const roleGuide = injectRoleWritingGuide({ targetRoles: parseTargetRoles(ctx.careerDNA || "") });

  // Query available resources for hints
  let resourceHint = "read_file(path='我的简历') — 读取你的完整简历";
  try {
    const refsRes = await fetch("http://localhost:3000/api/cv/references").catch(() => null);
    if (refsRes?.ok) {
      const refsJson = await refsRes.json();
      const refs = (refsJson.data || []) as Array<{ id: number; name: string; tags: string[] }>;
      if (refs.length) resourceHint += "\n参考简历: " + refs.map(r => `read_file(path='参考简历/${r.name}') [#${r.id}]`).join(", ");
    }
  } catch { /* non-blocking */ }

  const parts = [
    soul.body,
    "",
    roleGuide,
    "",
    "## 用户画像 (Career DNA)",
    ctx.careerDNA ? ctx.careerDNA.slice(0, 500) + (ctx.careerDNA.length > 500 ? "\n\n画像内容较长，完整信息请用 read_file 获取。" : "") : "暂无画像数据",
    "",
    "## 可用资源（直接使用，无需猜测参数）",
    resourceHint,
    "",
  ];
  if (ctx.agentKnowledge) parts.push("## JD信号词典", ctx.agentKnowledge, "");
  if (ctx.memoryDigest) parts.push("## 会话记忆", ctx.memoryDigest, "");

  const { registry } = await import("@/lib/agent/tools");
  const toolDescs = RESUME_TOOL_NAMES.map(name => { const t = registry.get(name); return t ? "- " + t.name + ": " + t.description : null; }).filter(Boolean).join("\n");
  if (toolDescs) parts.push("## 可用工具", "", toolDescs);

  return parts.join("\n");
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
  /(保存|沉淀|加入).*(优秀|参考|标杆|样例|范例).*(简历|CV|履历)/,
  /(优秀|参考|标杆|样例|范例).*(简历|CV|履历).*(保存|沉淀|加入)/,
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
