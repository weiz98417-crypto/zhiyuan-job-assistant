import db from "@/lib/db";
import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  try {
    const limit = Number(params.limit) || 10;
    const roleFilter = typeof params.role === "string" ? params.role.toLowerCase() : "";
    const archetypeFilter = typeof params.archetype === "string" ? params.archetype.toLowerCase() : "";

    const profile = await db.profiles.toCollection().first();
    if (!profile) {
      return { success: false, data: null, error: "用户画像未找到，请先创建画像" };
    }
    const apps = await db.applications.limit(100).toArray();
    let filtered = apps;
    if (roleFilter) filtered = filtered.filter(a => a.role?.toLowerCase().includes(roleFilter));
    if (archetypeFilter) filtered = filtered.filter(a => (a as unknown as Record<string, unknown>).archetype ? String((a as unknown as Record<string, unknown>).archetype).toLowerCase().includes(archetypeFilter) : true);
    return {
      success: true,
      data: {
        profile: { skills: profile.skills, marketFit: profile.marketFit, goals: profile.goals, salaryTarget: profile.preferences.salaryTarget },
        activity: { totalApplications: apps.length },
        recentApps: filtered.slice(0, limit).map(a => ({ company: a.company, role: a.role, score: a.score, status: a.status, date: a.date })),
      },
    };
  } catch {
    return { success: false, data: null, error: "画像获取失败" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `推荐失败: ${result.error}`;
  const data = result.data as { recentApps?: Array<{ company: string; role: string; score: number; status: string; date: string }>; profile?: unknown } | null;
  const apps = data?.recentApps || [];
  if (apps.length === 0) return "暂无匹配的推荐岗位。";
  return `基于画像推荐 ${apps.length} 个岗位:\n${apps.map(a => `${a.company}-${a.role} | ${a.score}/5 | ${a.status} | ${a.date}`).join("\n")}`;
}

export const getRecommendations: ToolDefinition = {
  name: "get_recommendations",
  description: "获取 Agent 智能推荐的岗位，基于用户画像和偏好。支持角色和 archetype 过滤。",
  parameters: {
    limit: { type: "number", required: false, description: "推荐数量，默认 10" },
    role: { type: "string", required: false, description: "岗位名过滤（模糊匹配）" },
    archetype: { type: "string", required: false, description: "Archetype 过滤，如 'AI产品经理'" },
  },
  category: "query",
  handler,
  formatResult,
};
