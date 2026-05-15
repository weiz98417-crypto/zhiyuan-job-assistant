import type { ToolDefinition, ToolResult } from "../types";

interface OptimizeParams {
  section?: string;
  instruction?: string;
  operation?: string;
  effort?: number;
}

const SECTION_MAP: Record<string, string> = {
  "个人概述": "summary", "概述": "summary", "summary": "summary",
  "工作经历": "experience", "经历": "experience", "工作": "experience", "experience": "experience",
  "项目经验": "projects", "项目": "projects", "projects": "projects",
  "教育背景": "education", "教育": "education", "education": "education",
  "技能": "skills", "skills": "skills",
};

function resolveSection(input?: string): string {
  if (!input) return "experience";
  for (const [key, id] of Object.entries(SECTION_MAP)) {
    if (input.includes(key)) return id;
  }
  return "experience";
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { section, instruction, operation = "full", effort = 3, referenceIds } = params as OptimizeParams & { referenceIds?: number[] };
  const sectionId = resolveSection(section);

  // Read CV from localStorage (cache) or SQLite (canonical)
  let fullCV: Record<string, string> = {};
  let sectionContent = "";
  let fromLocalStorage = false;
  const raw = localStorage.getItem("zhiyuan-cv");
  if (raw) {
    try {
      const cv = JSON.parse(raw);
      if (cv?.versions && cv?.activeVersion) {
        const sections = cv.versions[cv.activeVersion]?.sections || [];
        for (const s of sections) {
          fullCV[s.id] = s.content || "";
          if (s.id === sectionId) sectionContent = s.content || "";
        }
        fromLocalStorage = true;
      }
    } catch { /* ignore */ }
  }

  // Fallback to SQLite if localStorage is empty
  if (!sectionContent) {
    try {
      const cvRes = await fetch("/api/cv/data");
      if (cvRes.ok) {
        const json = await cvRes.json();
        const cvData = json.data || {};
        if (cvData?.versions && cvData?.activeVersion) {
          const version = cvData.versions as Record<string, { sections?: Array<{ id: string; content: string }> }>;
          const active = version[cvData.activeVersion as string];
          if (active?.sections) {
            for (const s of active.sections) {
              fullCV[s.id] = s.content || "";
              if (s.id === sectionId) sectionContent = s.content || "";
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  // If data came from localStorage, sync to SQLite so save_resume_section finds it
  if (fromLocalStorage && sectionContent) {
    fetch("/api/cv/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: raw! })
      .catch(() => { /* non-blocking — localStorage still has the data */ });
  }

  if (!sectionContent || sectionContent.trim().length < 20) {
    return { success: false, data: null, error: `${sectionId} 板块内容不足 20 字，无法优化`, recoverable: false, retryHint: "请先在 CV 页面完善该板块内容后再尝试优化" };
  }

  // 3. Call optimize-section API
  const optimizeRes = await fetch("/api/cv/optimize-section", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sectionId,
      sectionContent,
      fullCV,
      operation: operation || "full",
      effort: effort || 3,
      intent: instruction || "",
      enablePlaceholders: true,
      referenceIds: referenceIds || undefined,
      fast: !(referenceIds && referenceIds.length > 0), // Use Pro when reference resumes are provided
    }),
  });

  if (!optimizeRes.ok) {
    return { success: false, data: null, error: `优化请求失败: HTTP ${optimizeRes.status}`, recoverable: true, retryHint: "API 请求失败，请稍后重试或尝试减少改写力度参数" };
  }

  const optimizeJson = await optimizeRes.json();
  if (!optimizeJson.success) {
    return { success: false, data: null, error: optimizeJson.error || "优化失败", recoverable: true, retryHint: "优化服务返回错误，请尝试其他操作类型或降低 effort 参数" };
  }

  return {
    success: true,
    data: {
      sectionId,
      original: sectionContent,
      variants: optimizeJson.data?.variants || [],
      fullCV,
    },
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `优化失败: ${result.error}`;
  const d = result.data as { sectionId: string; original: string; variants: Array<{ label: string; content: string; approach?: string }> };

  const sectionLabel: Record<string, string> = { summary: "个人概述", experience: "工作经历", projects: "项目经验", education: "教育背景", skills: "技能" };

  let out = `## ✨ ${sectionLabel[d.sectionId] || d.sectionId} 优化方案\n\n`;
  for (const v of d.variants) {
    out += `### ${v.label || "改写"}\n${v.content}\n`;
    if (v.approach) out += `*策略: ${v.approach}*\n`;
    out += "\n";
  }
  out += "---\n⚠️ 请选择一个方案，回复「应用方案1」「用第一个」「第一个不错」等。**在我确认前不会写入简历**，等你选择后再保存。";
  return out;
}

export const optimizeResumeSection: ToolDefinition = {
  name: "optimize_resume_section",
  description: "优化简历的某个板块（工作经历/项目经验/技能/个人概述/教育背景）。支持 4 种操作：full(全面优化)/polish(润色)/expand(扩展)/quantify(量化)。当用户说'优化简历''改写经历''润色技能'时调用此工具。",
  parameters: {
    section: { type: "string", required: false, description: "要优化的板块：工作经历/项目经验/技能/个人概述/教育背景" },
    instruction: { type: "string", required: false, description: "优化意图，如'更量化''更简洁''突出 AI 产品能力'" },
    operation: { type: "string", required: false, description: "操作类型: full/polish/expand/quantify，默认 full" },
    effort: { type: "number", required: false, description: "改写力度 1-5，1最小改动 5最大改写，默认 3" },
    referenceIds: { type: "array", required: false, description: "参考简历 ID 列表，如 [1, 2]。从 get_profile 或 read_file 的参考简历库中获取" },
    jd_text: { type: "string", required: false, description: "JD 文本，用于针对性优化（强化 JD 关键词匹配）" },
  },
  category: "action",
  handler,
  formatResult,
};
