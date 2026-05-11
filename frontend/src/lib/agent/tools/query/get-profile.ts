import type { ToolDefinition, ToolResult } from "../types";

async function handler(): Promise<ToolResult> {
  try {
    // Fetch both sources in parallel
    const [dnaRes, profileRes] = await Promise.all([
      fetch("/api/profile/dna").catch(() => null),
      fetch("/api/data/profile").catch(() => null),
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

    return { success: true, data: { dnaSummary, profileData } };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `获取失败: ${result.error}`;
  const d = result.data as { dnaSummary?: string; profileData?: unknown };

  // Prefer the server-side DNA summary which is already formatted
  if (d.dnaSummary) return d.dnaSummary;

  // Fallback: format profileData into readable text
  if (d.profileData && typeof d.profileData === "object") {
    const pd = d.profileData as Record<string, unknown>;
    const parts: string[] = [];
    if (pd.skills && Array.isArray(pd.skills)) {
      const skills = pd.skills as Array<{ name: string }>;
      parts.push(`技能: ${skills.map(s => s.name).join("、")}`);
    }
    if (pd.goals) {
      const goals = pd.goals as Record<string, unknown>;
      if (Array.isArray(goals.targetRoles)) {
        const roles = goals.targetRoles as Array<{ role: string; level: string }>;
        parts.push(`目标岗位: ${roles.map(r => r.level ? `${r.role}(${r.level})` : r.role).join("、")}`);
      }
      if (Array.isArray(goals.dealBreakers)) {
        parts.push(`底线: ${(goals.dealBreakers as string[]).join("、")}`);
      }
    }
    if (parts.length) return parts.join("\n");
  }

  return "画像数据暂不可用";
}

export const getProfile: ToolDefinition = {
  name: "get_profile", description: "获取用户求职画像，包含目标岗位、经验级别、技能、薪资期望、底线条件",
  parameters: {}, category: "query", handler, formatResult,
};
