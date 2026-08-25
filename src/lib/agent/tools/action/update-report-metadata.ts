import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import {
  buildVerifiedActionFailure,
  buildVerifiedActionSuccess,
  type VerifiedActionCheck,
} from "@/lib/agent/verified-action";
import { updateReportMetadataForUser } from "@/lib/server/report-metadata-service";

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

function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
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

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const explicitReportNum = Number(params.reportNum);
  const reportNum = context
    ? Number.isFinite(explicitReportNum) && explicitReportNum > 0 ? explicitReportNum : undefined
    : await resolveReportNum(params.reportNum);
  if (!context && !reportNum) {
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

  if (context) {
    try {
      const report = await updateReportMetadataForUser(context.principal, {
        reportNum: reportNum || undefined,
        company,
        role,
        archetype,
        legitimacy,
        keywords: Array.isArray(payload.keywords) ? payload.keywords as string[] : undefined,
      });
      const expectedProjection = { report_num: report.report_num, ...payload };
      const readBackProjection: Record<string, unknown> = { report_num: report.report_num };
      for (const key of ["company", "role", "archetype", "legitimacy"] as const) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) readBackProjection[key] = report[key] || "";
      }
      if (Object.prototype.hasOwnProperty.call(payload, "keywords")) {
        readBackProjection.keywords = parseKeywords(report.keywords_json);
      }
      const verifiedAction = buildVerifiedActionSuccess({
        action: "update_report_metadata",
        targetType: "report",
        targetId: report.report_num,
        data: report,
        expectedContent: expectedProjection,
        readBackContent: readBackProjection,
        checks: [{
          phase: "verifier",
          ok: true,
          code: "report.metadata_read_back_match",
          message: "Updated report metadata matches principal-scoped read-back.",
        }],
      });
      return {
        success: true,
        data: report,
        errorCategory: "ok",
        llmSummary: `已更新报告 #${report.report_num} 的保存信息：${report.changed.join("；")}。这次只是修改已保存报告信息，没有重新评估或重新打分。`,
        uiPayload: {
          type: "report_metadata_updated",
          reportNum: report.report_num,
          company: report.company,
          role: report.role,
          readBackVerified: true,
        },
        verifiedAction,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "报告更新失败";
      const needsInput = /不存在|确认|没有提供/.test(message);
      return {
        success: false,
        data: null,
        error: message,
        errorCategory: needsInput ? "need_user_input" : "transient",
        recoverable: !needsInput,
        llmSummary: needsInput ? message : "报告更新暂时失败，Runtime 将读取持久状态后重试。",
        verifiedAction: buildVerifiedActionFailure({
          action: "update_report_metadata",
          targetType: "report",
          targetId: reportNum || undefined,
          error: message,
        }),
      };
    }
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
    let readBackReport: UpdatedReport | null = null;
    let readBackError = "";
    try {
      const verifyRes = await fetch(apiPath(`/api/data/reports/${reportNum}`), { cache: "no-store" });
      const verifyJson = await verifyRes.json().catch(() => ({}));
      if (verifyRes.ok && verifyJson.success && verifyJson.data) {
        readBackReport = verifyJson.data as UpdatedReport;
      } else {
        readBackError = verifyJson.error || `Report #${reportNum} read-back failed`;
      }
    } catch (error) {
      readBackError = error instanceof Error ? error.message : "Report metadata read-back failed";
    }

    const expectedProjection: Record<string, unknown> = { report_num: report.report_num };
    const readBackProjection: Record<string, unknown> = { report_num: readBackReport?.report_num || 0 };
    for (const key of ["company", "role", "archetype", "legitimacy"] as const) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        expectedProjection[key] = payload[key];
        readBackProjection[key] = readBackReport?.[key] || "";
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "keywords")) {
      expectedProjection.keywords = payload.keywords;
      readBackProjection.keywords = parseKeywords(readBackReport?.keywords_json);
    }
    const checks: VerifiedActionCheck[] = [
      {
        phase: "verifier",
        ok: Boolean(readBackReport),
        code: readBackReport ? "report.read_back_found" : "report.read_back_missing",
        message: "Updated report can be read back after metadata write.",
      },
      {
        phase: "verifier",
        ok: Number(readBackProjection.report_num) === Number(reportNum),
        code: Number(readBackProjection.report_num) === Number(reportNum) ? "report.id_match" : "report.id_mismatch",
        message: "Read-back report number matches the updated report.",
      },
    ];
    const verifiedAction = readBackReport
      ? buildVerifiedActionSuccess({
          action: "update_report_metadata",
          targetType: "report",
          targetId: reportNum || undefined,
          data: report,
          expectedContent: expectedProjection,
          readBackContent: readBackProjection,
          checks,
        })
      : buildVerifiedActionFailure({
          action: "update_report_metadata",
          targetType: "report",
          error: readBackError || "Report metadata read-back failed",
          checks,
          data: report,
        });
    if (!verifiedAction.success) {
      return {
        success: false,
        data: report,
        error: `报告元数据写入后读回校验失败：${verifiedAction.error || readBackError || "read-back mismatch"}`,
        errorCategory: "permanent",
        verifiedAction,
        uiPayload: {
          type: "report_metadata_updated",
          reportNum: report.report_num,
          readBackVerified: false,
          readBackError: verifiedAction.error || readBackError,
        },
      };
    }
    const verifiedReport = { ...report, readBackVerified: true };
    const changed = Object.entries(payload)
      .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(", ") : value}`)
      .join("；");

    return {
      success: true,
      data: verifiedReport,
      errorCategory: "ok",
      llmSummary: `已更新报告 #${report.report_num} 的保存信息：${changed}。这次只是修改已保存报告信息，没有重新评估或重新打分。`,
      uiPayload: {
        type: "report_metadata_updated",
        reportNum: report.report_num,
        company: report.company,
        role: report.role,
        readBackVerified: true,
      },
      verifiedAction,
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
