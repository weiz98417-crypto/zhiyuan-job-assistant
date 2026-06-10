import type { ToolDefinition, ToolResult } from "../types";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";

const SECTION_MAP: Record<string, string> = {
  "个人概述": "summary", "概述": "summary", "summary": "summary",
  "工作经历": "experience", "经历": "experience", "experience": "experience",
  "项目经验": "projects", "项目": "projects", "projects": "projects",
  "教育背景": "education", "教育": "education", "education": "education",
  "技能": "skills", "skills": "skills",
};

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const section = (params.section as string) || "experience";
  const newContent = (params.content as string) || "";

  if (!newContent.trim()) {
    return { success: false, data: null, error: "新内容不能为空", recoverable: false, retryHint: "请提供要保存的完整板块内容" };
  }

  const sectionId = (SECTION_MAP[section] || section) as ResumeSectionId;
  const validation = validateResumeSectionContent(sectionId, newContent);
  if (!validation.valid) {
    return {
      success: false,
      data: null,
      error: `保存被拦截: ${validation.reason || "内容不像完整简历板块"}`,
      recoverable: false,
      retryHint: "请提供要写入该板块的完整正文，不要只提供修改说明、占位符或对照表。",
    };
  }

  // 1. Read current CV from SQLite (canonical source)
  let cvData: Record<string, unknown> = {};
  try {
    const res = await fetch("/api/cv/data");
    if (res.ok) {
      const json = await res.json();
      cvData = json.data || {};
    }
  } catch { /* will try localStorage fallback */ }

  // 2. If CV data empty, try localStorage (cache fallback)
  if (!cvData || Object.keys(cvData).length === 0) {
    const raw = localStorage.getItem("zhiyuan-cv");
    if (raw) {
      try { cvData = JSON.parse(raw); } catch { /* ignore */ }
    }
  }

  if (!cvData?.versions || !(cvData as Record<string, unknown>).activeVersion) {
    return { success: false, data: null, error: "CV 数据为空，请先在 CV 页面创建简历", recoverable: false, retryHint: "请引导用户到 CV 页面 (/cv) 填写基本信息" };
  }

  // 3. Update the section in memory
  const version = (cvData as Record<string, unknown>).versions as Record<string, { sections?: Array<{ id: string; title: string; content: string }> }>;
  const active = version[(cvData as Record<string, unknown>).activeVersion as string];
  if (!active?.sections) {
    return { success: false, data: null, error: "CV 版本数据异常", recoverable: false, retryHint: "请联系用户检查 CV 数据结构" };
  }

  let found = false;
  for (const s of active.sections) {
    if (s.id === sectionId) {
      s.content = newContent;
      found = true;
      break;
    }
  }

  if (!found) {
    return { success: false, data: null, error: `找不到板块: ${sectionId}`, recoverable: false, retryHint: `可用板块: ${active.sections.map(s => s.id).join(", ")}` };
  }

  // 4. Write to SQLite (primary canonical store) — must succeed
  let putOk = false;
  try {
    const putRes = await fetch("/api/cv/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cvData),
    });
    putOk = putRes.ok;
    if (putOk) {
      const putJson = await putRes.json();
      if (!putJson.success) putOk = false;
    }
  } catch { putOk = false; }

  if (!putOk) {
    return { success: false, data: null, error: "CV 数据写入 SQLite 失败", recoverable: true, retryHint: "SQLite 写入失败，请重试保存操作" };
  }

  // 5. localStorage as cache only (SQLite is canonical)
  try {
    localStorage.setItem("zhiyuan-cv", JSON.stringify(cvData));
  } catch { /* localStorage may be full — non-critical since SQLite succeeded */ }

  const sectionLabels: Record<string, string> = { summary: "个人概述", experience: "工作经历", projects: "项目经验", education: "教育背景", skills: "技能" };

  return {
    success: true,
    data: { sectionId, sectionLabel: sectionLabels[sectionId] || sectionId, saved: true },
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `保存失败: ${result.error}`;
  const d = result.data as { sectionLabel: string; sectionId: string };
  return `✅ 已更新「${d.sectionLabel}」板块到 CV。打开 http://localhost:3000/cv 查看效果。`;
}

export const saveResumeSection: ToolDefinition = {
  name: "save_resume_section",
  description: "⚠️ 严格限制：只有当用户明确回复「应用」「保存」「写入」「确认」「用这个」等关键词后，才能调用此工具保存优化方案。绝不能在用户确认前自动保存！必须先展示优化结果、等待用户选择，用户说「好」「行」「可以」再保存。",
  parameters: {
    section: { type: "string", required: true, description: "板块名称：工作经历/项目经验/技能/个人概述/教育背景" },
    content: { type: "string", required: true, description: "要保存的完整板块内容" },
  },
  category: "action",
  handler,
  formatResult,
};
