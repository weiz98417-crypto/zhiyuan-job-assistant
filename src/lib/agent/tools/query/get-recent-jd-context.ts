import type { ToolDefinition, ToolResult } from "../types";

interface RecentJD {
  id?: number;
  company?: string;
  role?: string;
  body?: string;
  reportId?: number;
  createdAt?: string;
}

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const reportNum = Number(params.reportNum || params.reportId);
  const jdId = Number(params.jdId || params.jd_id);

  try {
    const res = await fetch(apiPath(Number.isFinite(jdId) && jdId > 0 ? `/api/data/jds?id=${jdId}` : "/api/data/jds"));
    const json = await res.json();
    if (!json.success) {
      return { success: false, data: null, error: json.error || "读取 JD 失败", errorCategory: "transient" };
    }

    const jds = Array.isArray(json.data) ? json.data as RecentJD[] : [json.data as RecentJD];
    const jd = Number.isFinite(jdId) && jdId > 0
      ? jds[0]
      : Number.isFinite(reportNum) && reportNum > 0
        ? jds.find((item) => Number(item.reportId) === reportNum)
        : jds[0];

    if (!jd?.body?.trim()) {
      return {
        success: false,
        data: null,
        error: "没有找到最近保存的 JD 文本",
        errorCategory: "need_user_input",
        llmSummary: "本地没有可复用的 JD 文本。请让用户粘贴 JD 正文或上传截图。",
      };
    }

    const body = jd.body.trim();
    const short = body.length > 2500 ? `${body.slice(0, 2500)}\n\n[JD 已截断，仅供继续评估上下文使用]` : body;

    return {
      success: true,
      data: jd,
      rawData: jd,
      errorCategory: "ok",
      llmSummary: `最近保存的 JD：${jd.company || "未知公司"} - ${jd.role || "未知岗位"}，报告编号 ${jd.reportId || "无"}。\n\nJD 正文：\n${short}`,
      uiPayload: {
        type: "recent_jd_context",
        company: jd.company,
        role: jd.role,
        reportId: jd.reportId,
        createdAt: jd.createdAt,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `读取最近 JD 失败: ${err instanceof Error ? err.message : "unknown"}`,
      errorCategory: "transient",
    };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return result.llmSummary || `读取 JD 失败: ${result.error}`;
  return result.llmSummary || "已读取最近 JD。";
}

export const getRecentJDContext: ToolDefinition = {
  name: "get_recent_jd_context",
  description: "读取最近保存的 JD 文本和关联报告编号。用户说'刚才那份JD/这份JD/上面的JD/已保存的JD'但没有重新粘贴正文时，先调用此工具，不要去抓网页或联网搜索。",
  matchHints: ["刚才的JD", "这份JD", "上面的JD", "已保存JD", "之前那份"],
  parameters: {
    jdId: { type: "number", required: false, description: "????? JD ??? id???????????????? id?" },
    reportNum: { type: "number", required: false, description: "可选，指定报告编号来读取对应 JD；不传则读取最近一份 JD。" },
  },
  category: "query",
  handler,
  formatResult,
  toolCtxCap: 3000,
};
