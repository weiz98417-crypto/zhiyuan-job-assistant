import { getScanJobsForUser } from "@/lib/scan-data";
import type { ToolDefinition, ToolResult } from "@/lib/agent/tools/types";

/**
 * 岗位精选素材（Spec 19 / ADR-0039）：无人值守精选 Run 的唯一工具。
 *
 * 只读：读取用户机会池中自水位线以来的新增岗位（含岗位指纹去重提示）。
 * 水位线由调度器在精选成功后推进——agent 在无人值守 Run 里没有任何写路径。
 */

export const JOB_DIGEST_TOP_LIMIT = 20;

export interface DigestOpportunity {
  id: string;
  title: string;
  company: string;
  url: string;
  fingerprint: string;
  createdAt: string | null;
}

export interface JobDigestMaterial {
  since: string | null;
  totalNew: number;
  opportunities: DigestOpportunity[];
  duplicates: Array<{ fingerprint: string; count: number }>;
  schedulerNote: string;
}

type AnyRow = Record<string, unknown>;

function text(row: AnyRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

/** 岗位指纹（词表）：规范化后的原 JD 链接；缺链接时退化为 公司+标题。 */
export function opportunityFingerprint(row: AnyRow): string {
  const dedupKey = text(row, ["dedup_key"]);
  if (dedupKey) return dedupKey.toLowerCase();
  const url = text(row, ["url", "job_url", "original_url", "link"]).replace(/[#?].*$/, "").replace(/\/+$/, "");
  if (url) return url.toLowerCase();
  return `${text(row, ["company", "company_name"])}::${text(row, ["title", "job_title"])}`.toLowerCase();
}

export async function buildJobDigestMaterial(userId: string, since: string | null, schedulerNote = ""): Promise<JobDigestMaterial> {
  const result = await getScanJobsForUser(userId, { status: "new", since: since || undefined, limit: 200 });
  const rows = (Array.isArray(result?.jobs) ? result.jobs : Array.isArray(result) ? result : []) as AnyRow[];

  const byFingerprint = new Map<string, number>();
  const opportunities: DigestOpportunity[] = [];
  for (const row of rows) {
    const fingerprint = opportunityFingerprint(row);
    byFingerprint.set(fingerprint, (byFingerprint.get(fingerprint) || 0) + 1);
    if (opportunities.length >= JOB_DIGEST_TOP_LIMIT) continue;
    opportunities.push({
      id: text(row, ["id", "job_id"]) || fingerprint,
      title: text(row, ["title", "job_title", "position"]),
      company: text(row, ["company", "company_name"]),
      url: text(row, ["url", "job_url", "original_url", "link"]),
      fingerprint,
      createdAt: text(row, ["discovered_at", "created_at"]) || null,
    });
  }
  const duplicates = Array.from(byFingerprint.entries())
    .filter(([, count]) => count > 1)
    .map(([fingerprint, count]) => ({ fingerprint, count }));

  return {
    since,
    totalNew: rows.length,
    opportunities,
    duplicates,
    schedulerNote,
  };
}

export function createGetJobDigestTool(): ToolDefinition {
  return {
    name: "get_job_digest",
    description: "读取用户机会池中自上次岗位精选以来的新增机会（只读，含去重提示与调度备注）。返回结构化素材，由你汇总为 Top 5 精选与点评。",
    category: "query",
    parameters: {},
    governance: undefined,
    handler: async (_params, context): Promise<ToolResult> => {
      const userId = context?.principal?.userId;
      if (!userId) {
        return { success: false, data: null, error: "缺少用户身份，无法读取机会池", errorCategory: "permanent" };
      }
      try {
        const material = await buildJobDigestMaterial(userId, null, "");
        return { success: true, data: material, errorCategory: "ok", llmSummary: `新增机会 ${material.totalNew} 条，精选候选 ${material.opportunities.length} 条` };
      } catch (error) {
        return {
          success: false,
          data: null,
          error: error instanceof Error ? error.message : "机会池读取失败",
          errorCategory: "transient",
          recoverable: true,
        };
      }
    },
    formatResult: (result: ToolResult) => {
      if (!result.success) return `岗位精选素材读取失败: ${result.error}`;
      const data = result.data as JobDigestMaterial | null;
      if (!data) return "无素材";
      const lines = data.opportunities.map((item, index) => `${index + 1}. ${item.title || "未知岗位"} @ ${item.company || "未知公司"}${item.url ? ` (${item.url})` : ""}`);
      const dedup = data.duplicates.length ? `重复提示：${data.duplicates.map((item) => `${item.fingerprint} x${item.count}`).join("；")}` : "无重复";
      const note = data.schedulerNote ? `调度备注：${data.schedulerNote}` : "";
      return [`自上次精选以来新增 ${data.totalNew} 条：`, ...lines, dedup, note].filter(Boolean).join("\n");
    },
  };
}

export const getJobDigestTool = createGetJobDigestTool();
