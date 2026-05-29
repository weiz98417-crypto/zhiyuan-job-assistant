import type { ToolDefinition, ToolResult } from "../types";

interface UpdatedReport {
  report_num: number;
  company: string;
  role: string;
  archetype?: string;
  legitimacy?: string;
  keywords_json?: string;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

async function resolveReportNum(value: unknown): Promise<number | null> {
  const explicit = Number(value);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  try {
    const listRes = await fetch(apiPath("/api/data/reports"));
    const listJson = await listRes.json();
    const latest = Array.isArray(listJson.data) ? listJson.data[0] : null;
    const latestNum = Number(latest?.report_num);
    return Number.isFinite(latestNum) && latestNum > 0 ? latestNum : null;
  } catch {
    return null;
  }
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const reportNum = await resolveReportNum(params.reportNum);
  if (!reportNum) {
    return {
      success: false,
      data: null,
      error: "reportNum is required",
      errorCategory: "need_user_input",
      llmSummary: "需要先确认要修改哪一份报告编号。",
    };
  }

  const payload: Record<string, unknown> = {};
  const company = stringParam(params.company);
  const role = stringParam(params.role);
  const archetype = stringParam(params.archetype);
  const legitimacy = stringParam(params.legitimacy);

  if (company) payload.company = company;
  if (role) payload.role = role;
  if (archetype) payload.archetype = archetype;
  if (legitimacy) payload.legitimacy = legitimacy;
  if (Array.isArray(params.keywords)) {
    payload.keywords = params.keywords
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }

  if (Object.keys(payload).length === 0) {
    return {
      success: false,
      data: null,
      error: "no fields to update",
      errorCategory: "need_user_input",
      llmSummary: "用户想修改报告，但没有提供公司、岗位、类型、合法性或关键词等可保存字段。",
    };
  }

  try {
    const res = await fetch(apiPath(`/api/data/reports/${reportNum}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return {
        success: false,
        data: null,
        error: json.error || "报告更新失败",
        errorCategory: res.status === 404 ? "need_user_input" : "permanent",
        llmSummary: `报告 #${reportNum} 更新失败：${json.error || res.statusText}`,
      };
    }

    const report = json.data as UpdatedReport;
    const changed = Object.entries(payload)
      .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(", ") : value}`)
      .join("；");

    return {
      success: true,
      data: report,
      errorCategory: "ok",
      llmSummary: `已更新报告 #${report.report_num} 的保存信息：${changed}。这次只是修改已保存报告信息，没有重新评估或重新打分。`,
      uiPayload: {
        type: "report_metadata_updated",
        reportNum: report.report_num,
        company: report.company,
        role: report.role,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `更新失败: ${err instanceof Error ? err.message : "unknown"}`,
      errorCategory: "transient",
      llmSummary: "报告更新接口暂时不可用，可以稍后重试。",
    };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return result.llmSummary || `报告更新失败: ${result.error}`;
  return result.llmSummary || "报告信息已更新，没有重新评估。";
}

export const updateReportMetadata: ToolDefinition = {
  name: "update_report_metadata",
  description: "修改已保存评估报告的基础信息，例如公司、岗位、类型、合法性备注或关键词。用于补充/更正报告信息，不会重新评估、重新打分或消耗大模型评估额度。",
  matchHints: ["修改报告", "更正报告", "补充公司", "公司是", "改成", "不要重新评估"],
  parameters: {
    reportNum: { type: "number", required: false, description: "要修改的报告编号。用户没说时，工具会默认使用最近一份报告；不确定再询问。" },
    company: { type: "string", required: false, description: "新的公司名称，例如字节跳动、阿里、腾讯。" },
    role: { type: "string", required: false, description: "新的岗位名称。" },
    archetype: { type: "string", required: false, description: "新的岗位/报告类型标签。" },
    legitimacy: { type: "string", required: false, description: "新的合法性或风险简述。" },
    keywords: { type: "array", required: false, description: "新的关键词列表。" },
  },
  category: "action",
  handler,
  formatResult,
  toolCtxCap: 500,
};
