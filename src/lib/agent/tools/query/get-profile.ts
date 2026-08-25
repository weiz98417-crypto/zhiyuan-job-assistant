import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { fetchAgentMemoryContext } from "../memory-helpers";

async function handler(
  params: Record<string, unknown> = {},
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const sectionFilter = typeof params.section === "string" ? params.section.trim() : "";
  try {
    let dnaSummary = "";
    let profileData: Record<string, unknown> | null = null;
    let cvData: Record<string, unknown> | null = null;
    const cvSections: Record<string, string> = {};
    let refResumes: Array<{ id: number; name: string; tags: string[] }> = [];
    if (context) {
      const service = getAgentReadService();
      const [dna, profile, cv, references] = await Promise.all([
        service.getProfileDnaSummary(context.principal),
        service.getProfile(context.principal),
        service.getCurrentResume(context.principal),
        service.listReferenceResumes(context.principal),
      ]);
      dnaSummary = dna;
      profileData = profile as Record<string, unknown> | null;
      cvData = cv;
      refResumes = references.map((reference) => ({
        id: reference.id,
        name: reference.name,
        tags: reference.tags.map(String),
      }));
    } else {
      const [dnaRes, profileRes, cvRes, refsRes] = await Promise.all([
        fetch("/api/profile/dna").catch(() => null),
        fetch("/api/data/profile").catch(() => null),
        fetch("/api/cv/data").catch(() => null),
        fetch("/api/cv/references").catch(() => null),
      ]);
      if (dnaRes?.ok) {
        const json = await dnaRes.json();
        dnaSummary = json?.data?.summary || "";
      }
      if (profileRes?.ok) {
        const json = await profileRes.json();
        profileData = (json?.data || null) as Record<string, unknown> | null;
      }
      if (cvRes?.ok) {
        const json = await cvRes.json();
        cvData = (json?.data || null) as Record<string, unknown> | null;
      }
      if (refsRes?.ok) {
        const json = await refsRes.json();
        refResumes = (json?.data || []) as Array<{ id: number; name: string; tags: string[] }>;
      }
    }

    if (cvData?.versions) {
      const versions = cvData.versions as Record<string, { sections?: Array<{ id: string; title: string; content: string }> }>;
      const activeVer = (cvData.activeVersion as string) || Object.keys(versions)[0];
      const sections = versions[activeVer]?.sections || [];
      for (const section of sections) cvSections[section.id] = (section.content || "").trim();
    }

    // Build llmSummary — concise decision text for LLM
    const summaryParts: string[] = [];

    // If section is specified, return full text of that section
    if (sectionFilter) {
      const sectionContent = cvSections[sectionFilter];
      if (sectionContent) {
        summaryParts.push(`简历板块 ${sectionFilter}: ${sectionContent}`);
      } else {
        summaryParts.push(`简历板块 ${sectionFilter}: 无内容`);
      }
    } else {
      const name = cvSections.summary?.split("\n")[0]?.trim() || "（未填）";
      summaryParts.push(`用户: ${name}`);
      const sectionStatus: string[] = [];
      for (const id of ["summary", "experience", "projects", "education", "skills"]) {
        if (cvSections[id]) sectionStatus.push(`${id}(${cvSections[id].length}字)`);
      }
      if (sectionStatus.length > 0) summaryParts.push(`简历板块: ${sectionStatus.join(", ")}`);
      else summaryParts.push("简历板块: 无（简历尚未填写）");
    }

    if (refResumes.length > 0) {
      const refList = refResumes.map(r => `#${r.id} ${r.name}`).join(", ");
      summaryParts.push(`参考简历: ${refList}`);
    }

    const goals = profileData?.goals as Record<string, unknown> | undefined;
    if (goals) {
      const roles = (goals.targetRoles as Array<{ role: string; level: string }>) || [];
      if (roles.length) summaryParts.push(`目标: ${roles.map(r => r.level ? `${r.role}(${r.level})` : r.role).join(", ")}`);
      const dealBreakers = goals.dealBreakers as string[] | undefined;
      if (dealBreakers?.length) summaryParts.push(`底线: ${dealBreakers.join(", ")}`);
    }

    const memoryInput = {
      task: "profile_growth",
      agentId: "profile",
      query: sectionFilter ? `profile ${sectionFilter}` : "profile resume goals preferences interview observations",
      budgetChars: 700,
      semanticTopK: 4,
    };
    const memoryContext = context
      ? await assembleAgentMemoryContext({ ...memoryInput, userId: context.principal.userId })
      : await fetchAgentMemoryContext(memoryInput);
    if (memoryContext?.llmSummary) summaryParts.push(`Long-term memory: ${memoryContext.llmSummary}`);

    return {
      success: true,
      errorCategory: "ok",
      llmSummary: summaryParts.join(" | ") || "画像数据暂不可用",
      uiPayload: {
        type: "profile_view_card",
        cvSections,
        goals: goals || null,
        refResumes: refResumes.map(r => ({ id: r.id, name: r.name, tags: r.tags })),
        dnaSummary,
        memoryContext: memoryContext ? {
          task: memoryContext.task,
          structuredCount: memoryContext.structuredFacts.length,
          semanticCount: memoryContext.semanticSnippets.length,
          warnings: memoryContext.warnings,
        } : null,
      },
      rawData: { dnaSummary, profileData, cvData, refResumes, memoryContext },
      data: { dnaSummary, profileData, cvData, refResumes, memoryContext }, // backward compat
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `${err instanceof Error ? err.message : "unknown"}`,
      errorCategory: "transient",
    };
  }
}

/** @deprecated Use llmSummary field in ToolResult instead */
function formatResult(result: ToolResult): string {
  if (!result.success) return `获取失败: ${result.error}`;
  return result.llmSummary || "画像数据暂不可用";
}

export const getProfile: ToolDefinition = {
  toolCtxCap: 800,
  name: "get_profile",
  description: "获取用户完整求职画像和简历全文。支持 section 参数按需只获取特定板块（summary/experience/projects/education/skills）。",
  parameters: {
    section: { type: "string", required: false, description: "只获取指定板块: summary/experience/projects/education/skills。不传则获取全部摘要" },
  }, category: "query", handler, formatResult,
};
