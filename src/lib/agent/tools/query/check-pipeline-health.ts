import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import { getPipelineHealthForUser } from "@/lib/server/agent-insight-service";

interface AppRecord {
  company?: string;
  role?: string;
  date?: string;
  status?: string;
  notes?: string;
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  if (context) {
    try {
      const threshold = Number(params.days_threshold) || 7;
      return { success: true, data: await getPipelineHealthForUser(context.principal, threshold) };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "无法读取投递数据库",
        errorCategory: "transient",
        recoverable: true,
      };
    }
  }
  try {
    // Read applications from IndexedDB via existing Dexie wrapper
    const { default: db } = await import("@/lib/db");
    const apps = await db.applications.toArray() as AppRecord[];
    if (!apps.length) return { success: true, data: { overdue: [], healthy: 0, total: 0 } };

    const now = new Date();
    const overdue = apps
      .filter((a) => {
        if (!a.date) return false;
        const appDate = new Date(a.date);
        const daysSince = Math.floor((now.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysSince > 7 && a.status !== "已拒" && a.status !== "已入职" && a.status !== "已放弃";
      })
      .map((a) => {
        const appDate = new Date(a.date!);
        const daysSince = Math.floor((now.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));
        return { company: a.company || "未知", role: a.role || "未知", date: a.date, daysSince, status: a.status || "未知" };
      })
      .sort((a, b) => b.daysSince - a.daysSince);

    return { success: true, data: { overdue, healthy: apps.length - overdue.length, total: apps.length } };
  } catch {
    return { success: false, data: null, error: "无法访问投递数据库，请刷新页面后重试" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `管道检查失败: ${result.error}`;
  const d = result.data as { overdue: Array<{ company: string; role: string; date: string; daysSince: number; status: string }>; healthy: number; total: number };
  if (d.total === 0) return "暂无投递记录。";
  if (!d.overdue.length) return `✅ 管道健康，${d.total} 条投递均在正常跟进周期内。`;

  const rows = d.overdue.map((o) =>
    `| ${o.company} | ${o.role} | ${o.date} | ${o.daysSince} 天 | ${o.status} | ⚠️ 建议跟进 |`
  ).join("\n");

  return `## 📋 管道健康检查\n\n**${d.total}** 条投递，**${d.healthy}** 条正常，**${d.overdue.length}** 条逾期：\n\n| 公司 | 岗位 | 投递日期 | 已过天数 | 状态 | 建议 |\n|------|------|---------|---------|------|------|\n${rows}`;
}

export const checkPipelineHealth: ToolDefinition = {
  name: "check_pipeline_health",
  description: "检测投递管道健康状态。识别超过 7 天未回复的投递项，按逾期天数排序。当用户问'投了哪些还没回''管道状态'时调用此工具。",
  parameters: {
    days_threshold: { type: "number", required: false, description: "逾期天数阈值，默认 7" },
  },
  category: "query",
  handler,
  formatResult,
};
