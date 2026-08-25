import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getDataRepositories } from "@/lib/data-repositories";
import type { ReportRow } from "@/lib/server-db";

export interface UpdateReportMetadataInput {
  reportNum?: number;
  company?: string;
  role?: string;
  archetype?: string;
  legitimacy?: string;
  keywords?: string[];
}

export interface UpdatedReportMetadata extends ReportRow {
  readBackVerified: true;
  changed: string[];
}

export class ReportMetadataServiceError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid_input" | "verification_failed",
    message: string,
  ) {
    super(message);
    this.name = "ReportMetadataServiceError";
  }
}

export async function updateReportMetadataForUser(
  principal: ExecutionPrincipal,
  input: UpdateReportMetadataInput,
): Promise<UpdatedReportMetadata> {
  const repositories = getDataRepositories();
  const explicit = Number(input.reportNum);
  const reportNum = Number.isFinite(explicit) && explicit > 0
    ? explicit
    : Number((await repositories.reports.list(principal.userId))[0]?.report_num || 0);
  if (!reportNum) throw new ReportMetadataServiceError("not_found", "需要先确认要修改哪一份报告编号");
  const update: Partial<ReportRow> & { keywords_json?: string } = {};
  const changed: string[] = [];
  for (const key of ["company", "role", "archetype", "legitimacy"] as const) {
    const value = input[key]?.trim();
    if (!value) continue;
    update[key] = value;
    changed.push(`${key}=${value}`);
  }
  if (Array.isArray(input.keywords)) {
    const keywords = input.keywords.map((item) => item.trim()).filter(Boolean);
    update.keywords_json = JSON.stringify(keywords);
    changed.push(`keywords=${keywords.join(", ")}`);
  }
  if (changed.length === 0) {
    throw new ReportMetadataServiceError("invalid_input", "没有提供可更新的报告字段");
  }
  const updated = await repositories.reports.updateMetadata(reportNum, update, principal.userId);
  if (!updated) throw new ReportMetadataServiceError("not_found", `报告 #${reportNum} 不存在`);
  const readBack = await repositories.reports.get(reportNum, principal.userId);
  if (!readBack || !metadataMatches(readBack, update)) {
    throw new ReportMetadataServiceError("verification_failed", "报告元数据写入后读回校验失败");
  }
  return { ...readBack, readBackVerified: true, changed };
}

function metadataMatches(
  report: ReportRow,
  expected: Partial<ReportRow> & { keywords_json?: string },
): boolean {
  for (const key of ["company", "role", "archetype", "legitimacy"] as const) {
    if (expected[key] !== undefined && (report[key] || "") !== expected[key]) return false;
  }
  return expected.keywords_json === undefined
    || canonicalKeywords(report.keywords_json) === canonicalKeywords(expected.keywords_json);
}

function canonicalKeywords(value: unknown): string {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return JSON.stringify(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return "[]";
  }
}
