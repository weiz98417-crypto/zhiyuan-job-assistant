import type { ToolDefinition, ToolResult } from "../types";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import {
  buildVerifiedActionFailure,
  buildVerifiedActionSuccess,
  stableContentHash,
  validateDocumentFieldContent,
} from "@/lib/agent/verified-action";

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
  const expectedBaseHash = typeof params.baseHash === "string" ? params.baseHash : "";
  const expectedBaseVersion = typeof params.baseVersion === "string" ? params.baseVersion : "";

  if (!newContent.trim()) {
    return { success: false, data: null, error: "新内容不能为空", recoverable: false, retryHint: "请提供要保存的完整板块内容" };
  }

  const sectionId = (SECTION_MAP[section] || section) as ResumeSectionId;
  const validation = validateResumeSectionContent(sectionId, newContent);
  if (!validation.valid) {
    const verifiedAction = buildVerifiedActionFailure({
      action: "save_resume_section",
      targetType: "cv",
      error: validation.reason || "内容不像完整简历板块",
    });
    return {
      success: false,
      data: null,
      error: `保存被拦截: ${validation.reason || "内容不像完整简历板块"}`,
      recoverable: false,
      retryHint: "请提供要写入该板块的完整正文，不要只提供修改说明、占位符或对照表。",
      verifiedAction,
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

  // 3. Verify base snapshot before mutating the in-memory CV.
  const currentActiveVersion = (cvData as Record<string, unknown>).activeVersion as string;
  const version = (cvData as Record<string, unknown>).versions as Record<string, { sections?: Array<{ id: string; title: string; content: string }> }>;
  const active = version[currentActiveVersion];
  if (!active?.sections) {
    return { success: false, data: null, error: "CV 版本数据异常", recoverable: false, retryHint: "请联系用户检查 CV 数据结构" };
  }
  const currentBaseHash = stableContentHash(active);
  const baseVersionConflict = Boolean(expectedBaseVersion && expectedBaseVersion !== currentActiveVersion);
  const baseHashConflict = Boolean(expectedBaseHash && expectedBaseHash !== currentBaseHash);
  if (baseVersionConflict || baseHashConflict) {
    const error = "简历已经发生变化，已阻止用旧上下文覆盖当前版本。请重新读取简历、重新生成差异，并请用户确认后再保存。";
    return {
      success: false,
      data: {
        sectionId,
        saved: false,
        expectedBaseVersion,
        currentBaseVersion: currentActiveVersion,
        expectedBaseHash,
        currentBaseHash,
      },
      error,
      errorCategory: "need_user_input",
      recoverable: false,
      retryHint: "请重新读取最新简历内容后再生成新的修改方案。",
      verifiedAction: buildVerifiedActionFailure({
        action: "save_resume_section",
        targetType: "cv",
        targetField: sectionId,
        baseHash: currentBaseHash,
        versionId: currentActiveVersion,
        precheck: {
          phase: "precheck",
          ok: false,
          code: "base_version.conflict",
          message: `Expected ${expectedBaseVersion || expectedBaseHash || "unknown base"} but current CV is ${currentActiveVersion}/${currentBaseHash}.`,
        },
        verifier: {
          phase: "verifier",
          ok: false,
          code: "base_version_conflict",
          message: error,
        },
        error,
      }),
    };
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
    return {
      success: false,
      data: null,
      error: "CV 数据写入失败",
      recoverable: true,
      retryHint: "CV 写入失败，请重试保存操作",
      verifiedAction: buildVerifiedActionFailure({
        action: "save_resume_section",
        targetType: "cv",
        error: "CV 数据写入失败",
      }),
    };
  }

  // 5. Read back the canonical store before claiming success.
  let readBackContent = "";
  try {
    const verifyRes = await fetch("/api/cv/data", { cache: "no-store" });
    if (verifyRes.ok) {
      const verifyJson = await verifyRes.json();
      const verifyData = verifyJson.data || {};
      const verifyVersions = verifyData.versions as Record<string, { sections?: Array<{ id: string; content: string }> }> | undefined;
      const verifyActive = verifyVersions?.[verifyData.activeVersion as string];
      readBackContent = verifyActive?.sections?.find((s) => s.id === sectionId)?.content || "";
    }
  } catch {
    readBackContent = "";
  }

  const documentValidation = validateDocumentFieldContent(newContent, {
    minCompactLength: 1,
    targetLabel: sectionId,
  });
  const verifiedAction = buildVerifiedActionSuccess({
    action: "save_resume_section",
    targetType: "cv",
    targetField: sectionId,
    baseHash: currentBaseHash,
    versionId: currentActiveVersion,
    data: { sectionId, saved: true },
    expectedContent: newContent,
    readBackContent,
    checks: documentValidation.checks,
  });
  if (!verifiedAction.success) {
    return {
      success: false,
      data: null,
      error: "CV 写入后校验失败：读取到的内容与预期不一致，已阻止成功提示",
      recoverable: true,
      retryHint: "请重新读取简历后再生成差异并保存。",
      verifiedAction,
    };
  }

  // 6. localStorage as cache only (server store is canonical)
  try {
    localStorage.setItem("zhiyuan-cv", JSON.stringify(cvData));
  } catch { /* localStorage may be full — non-critical since SQLite succeeded */ }

  const sectionLabels: Record<string, string> = { summary: "个人概述", experience: "工作经历", projects: "项目经验", education: "教育背景", skills: "技能" };

  return {
    success: true,
    data: {
      sectionId,
      sectionLabel: sectionLabels[sectionId] || sectionId,
      saved: true,
      baseHash: currentBaseHash,
      versionId: currentActiveVersion,
    },
    verifiedAction,
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
    baseHash: { type: "string", required: false, description: "Agent run 开始时读取到的 CV 基线哈希，用于防止并发覆盖。" },
    baseVersion: { type: "string", required: false, description: "Agent run 开始时读取到的 CV 版本 id，用于防止并发覆盖。" },
  },
  category: "action",
  handler,
  formatResult,
};
