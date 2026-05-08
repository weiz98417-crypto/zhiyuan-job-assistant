import db from "@/lib/db";
import type { ToolDefinition, ToolResult } from "../types";

async function handler(_params: Record<string, unknown>): Promise<ToolResult> {
  try {
    const profile = await db.profiles.toCollection().first();
    if (!profile) {
      return { success: false, data: null, error: "用户画像未找到，请先创建画像" };
    }
    // Return raw stats + preferences for LLM to process
    const stats = await db.applications.toCollection().count();
    const apps = await db.applications.limit(100).toArray();
    return {
      success: true,
      data: {
        profile: {
          skills: profile.skills,
          marketFit: profile.marketFit,
          goals: profile.goals,
          salaryTarget: profile.preferences.salaryTarget,
        },
        activity: { totalApplications: stats },
        recentApps: apps.slice(0, 10),
      },
    };
  } catch {
    return { success: false, data: null, error: "画像获取失败" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `推荐失败: ${result.error}`;
  const data = result.data as { recentApps?: unknown[] } | null;
  const count = Array.isArray(data?.recentApps) ? data.recentApps.length : 0;
  return `获取到 ${count} 个推荐岗位`;
}

export const getRecommendations: ToolDefinition = {
  name: "get_recommendations",
  description: "获取 Agent 智能推荐的岗位，基于用户画像和偏好",
  parameters: {
    limit: { type: "number", required: false, description: "推荐数量，默认 3" },
  },
  category: "query",
  handler,
  formatResult,
};
