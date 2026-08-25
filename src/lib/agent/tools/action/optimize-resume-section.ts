import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { fetchAgentMemoryContext } from "../memory-helpers";
import {
  optimizeResumeSectionForAgent,
  ResumeOptimizationInputError,
} from "@/lib/server/resume-optimization-service";

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

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const { section, instruction, operation = "full", effort = 3, referenceIds } = params as OptimizeParams & { referenceIds?: number[] };
  const sectionId = resolveSection(section);

  if (context) {
    try {
      const data = await optimizeResumeSectionForAgent(context.principal, {
        sectionId: sectionId as "summary" | "experience" | "projects" | "education" | "skills",
        instruction,
        operation,
        effort,
        referenceIds,
        jdText: typeof params.jd_text === "string" ? params.jd_text : undefined,
        requestKey: context.requestId || `${context.runId}:optimize_resume_section:${sectionId}`,
      }, { signal: context.signal });
      return {
        success: true,
        data: {
          sectionId: data.sectionId,
          artifactId: data.artifactId,
          draftIds: data.variants.map((draft) => draft.id),
          readBackVerified: true,
        },
        llmSummary: `已为 ${data.sectionId} 生成并持久化 ${data.variants.length} 个简历草稿。artifactId=${data.artifactId}。可选草稿：${data.variants.map((draft) => `${draft.label}:${draft.id}`).join("；")}。等待用户选择后，调用 create_resume_edit_proposal(draftId=所选ID)。`,
        uiPayload: { type: "resume_draft", ...data },
        rawData: data,
      };
    } catch (error) {
      const needsInput = error instanceof ResumeOptimizationInputError;
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "优化失败",
        errorCategory: needsInput ? "need_user_input" : "transient",
        recoverable: !needsInput,
      };
    }
  }

  // Read the server document first. localStorage is only a compatibility cache.
  const fullCV: Record<string, string> = {};
  let sectionContent = "";
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

  // Cache fallback is only used when the authoritative read is unavailable.
  if (!sectionContent && typeof localStorage !== "undefined") {
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
        }
      } catch { /* ignore */ }
    }
  }

  if (!sectionContent || sectionContent.trim().length < 20) {
    return { success: false, data: null, error: `${sectionId} 板块内容不足 20 字，无法优化`, recoverable: false, retryHint: "请先在 CV 页面完善该板块内容后再尝试优化" };
  }

  const memoryContext = await fetchAgentMemoryContext({
    task: "resume_optimization",
    agentId: "resume",
    query: `${instruction || ""}\n${String(params.jd_text || "").slice(0, 900)}\n${sectionContent.slice(0, 900)}`,
    budgetChars: 900,
    semanticTopK: 4,
  });
  const instructionWithMemory = [
    instruction || "",
    String(params.jd_text || "").trim() ? `Target JD:\n${String(params.jd_text).slice(0, 1200)}` : "",
    memoryContext?.llmSummary ? `Long-term memory context:\n${memoryContext.llmSummary}` : "",
  ].filter(Boolean).join("\n\n");

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
      intent: instructionWithMemory,
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

  const variants = optimizeJson.data?.variants || [];
  let draftData = optimizeJson.data?.artifactId && optimizeJson.data?.readBackVerified
    ? optimizeJson.data
    : null;
  if (!draftData) {
    const draftRes = await fetch("/api/cv/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId, variants }),
    });
    const draftJson = await draftRes.json().catch(() => ({}));
    if (!draftRes.ok || !draftJson.success || !draftJson.data?.artifactId) {
      return {
        success: false,
        data: { sectionId, variants },
        error: draftJson.error || "优化方案未能持久化，已阻止把临时聊天文本当作可应用草稿",
        errorCategory: draftRes.status >= 500 ? "transient" : "permanent",
      };
    }
    draftData = draftJson.data;
  }

  return {
    success: true,
    data: {
      sectionId,
      artifactId: draftData.artifactId,
      draftIds: draftData.variants.map((draft: { id: string }) => draft.id),
      readBackVerified: true,
    },
    llmSummary: `已为 ${sectionId} 生成并持久化 ${draftData.variants.length} 个简历草稿。artifactId=${draftData.artifactId}。可选草稿：${draftData.variants.map((draft: { id: string; label?: string }) => `${draft.label || "方案"}:${draft.id}`).join("；")}。等待用户选择后，调用 create_resume_edit_proposal(draftId=所选ID)，不要从 Markdown 重建正文。`,
    uiPayload: {
      type: "resume_draft",
      artifactId: draftData.artifactId,
      sectionId,
      variants: draftData.variants.map((draft: { id: string; variantId?: string; label?: string; title?: string; approach?: string }) => ({
        id: draft.id,
        variantId: draft.variantId,
        label: draft.label || draft.title,
        approach: draft.approach,
      })),
      readBackVerified: draftData.readBackVerified === true,
    },
    rawData: draftData,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `优化失败: ${result.error}`;
  const d = result.data as { sectionId?: string; artifactId?: string; draftIds?: string[] };
  return `已生成 ${d.sectionId || "简历"} 优化草稿 ${d.artifactId || ""}，共 ${d.draftIds?.length || 0} 个方案，等待用户在草稿卡中选择。`;
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
