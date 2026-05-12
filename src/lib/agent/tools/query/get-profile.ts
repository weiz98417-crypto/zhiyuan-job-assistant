import type { ToolDefinition, ToolResult } from "../types";

async function handler(): Promise<ToolResult> {
  try {
    // Fetch all four sources in parallel (dna, profile, cv, reference resumes)
    const [dnaRes, profileRes, cvRes, refsRes] = await Promise.all([
      fetch("/api/profile/dna").catch(() => null),
      fetch("/api/data/profile").catch(() => null),
      fetch("/api/cv/data").catch(() => null),
      fetch("/api/cv/references").catch(() => null),
    ]);

    let dnaSummary = "";
    if (dnaRes?.ok) {
      const j = await dnaRes.json();
      dnaSummary = j?.data?.summary || "";
    }

    let profileData: unknown = null;
    if (profileRes?.ok) {
      const j = await profileRes.json();
      profileData = j?.data || null;
    }

    let cvData: unknown = null;
    if (cvRes?.ok) {
      const j = await cvRes.json();
      cvData = j?.data || null;
    }

    let refResumes: Array<{ id: number; name: string; tags: string[] }> = [];
    if (refsRes?.ok) {
      const j = await refsRes.json();
      refResumes = (j?.data || []) as Array<{ id: number; name: string; tags: string[] }>;
    }

    return { success: true, data: { dnaSummary, profileData, cvData, refResumes } };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `获取失败: ${result.error}`;
  const d = result.data as { dnaSummary?: string; profileData?: unknown; cvData?: unknown };

  // formatResult is for LLM context only — keep it SHORT.
  // Full data is rendered by ProfileViewCard via the structured toolResult.data.
  const parts: string[] = [];

  if (d.cvData && typeof d.cvData === "object") {
    const cv = d.cvData as Record<string, unknown>;
    const versions = cv.versions as Record<string, { sections?: Array<{ id: string; title: string; content: string }> }> | undefined;
    const activeVer = cv.activeVersion as string;
    if (versions && activeVer && versions[activeVer]?.sections) {
      const sections = versions[activeVer].sections;
      const byId: Record<string, string> = {};
      for (const s of sections) byId[s.id] = (s.content || "").trim();

      // Only extract name and section lengths — full text goes to ProfileViewCard
      const name = byId.summary?.split("\n")[0]?.trim() || "（未填）";
      parts.push(`用户: ${name}`);

      const sectionSummary: string[] = [];
      for (const id of ["summary", "experience", "projects", "education", "skills"]) {
        if (byId[id]) {
          const len = byId[id].length;
          sectionSummary.push(`${id}(${len}字)`);
        }
      }
      parts.push(`简历板块: ${sectionSummary.join(", ")}`);
    }
  }

  // Uploaded reference resumes (user may want to reference these)
  const refs = (d as { refResumes?: Array<{ id: number; name: string; tags: string[] }> }).refResumes;
  if (refs?.length) {
    const refLines = refs.map(r => `  #${r.id} ${r.name} ${r.tags.length ? `[${r.tags.slice(0,3).join(", ")}]` : ""}`);
    parts.push(`参考简历库:\n${refLines.join("\n")}`);
  }

  if (d.profileData && typeof d.profileData === "object") {
    const pd = d.profileData as Record<string, unknown>;
    const goals = pd.goals as Record<string, unknown> | undefined;
    if (goals) {
      const roles = (goals.targetRoles as Array<{ role: string; level: string }>) || [];
      if (roles.length) parts.push(`目标: ${roles.map(r => r.level ? `${r.role}(${r.level})` : r.role).join(", ")}`);
    }
  }

  return parts.join(" | ") || "画像数据暂不可用";
}

export const getProfile: ToolDefinition = {
  name: "get_profile", description: "获取用户求职画像，包含目标岗位、经验级别、技能、薪资期望、底线条件",
  parameters: {}, category: "query", handler, formatResult,
};
