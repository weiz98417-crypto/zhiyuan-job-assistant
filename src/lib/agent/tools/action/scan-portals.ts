import type { ToolDefinition, ToolResult } from "@/lib/agent/tools/types";

interface JobDiscoveryRunInput {
  companies?: string[];
  titleKeywords?: string[] | string;
  titleKeyword?: string;
  excludeKeywords?: string[] | string;
  excludeKeyword?: string;
  query?: string;
  location?: string;
  maxResults?: number;
}

type ScanPortalsParams = JobDiscoveryRunInput & {
  confirmed?: boolean;
  userConfirmed?: boolean;
  profileDerived?: Array<{ field: string; label?: string; value?: unknown }>;
  existingJobs?: Array<Record<string, unknown>>;
  offset?: number;
};

export const scanPortals: ToolDefinition<ScanPortalsParams> = {
  name: "scan_portals",
  description: "通过岗位发现系统创建或恢复真实扫描任务，并返回结构化岗位发现状态。",
  category: "action",
  matchHints: ["岗位发现", "开始岗位发现", "帮我找岗位", "搜职位", "扫一批 JD", "换一批"],
  parameters: {
    query: { type: "string", required: false, description: "用户的岗位发现目标或岗位关键词。" },
    titleKeywords: { type: "array", required: false, description: "岗位关键词列表，例如 AI 产品经理、数据产品经理。" },
    excludeKeywords: { type: "array", required: false, description: "排除关键词列表，例如 实习、外包、销售。" },
    location: { type: "string", required: false, description: "城市或地点偏好。" },
    maxResults: { type: "number", required: false, description: "本轮最多发现的岗位机会数量。" },
    confirmed: { type: "boolean", required: false, description: "用户是否已经确认开始岗位发现。" },
  },
  async handler(params) {
    const criteria = normalizeJobDiscoveryCriteria(params);
    const confirmed = params.confirmed === true || params.userConfirmed === true;
    const changeBatch = /换一批|再来一批|下一批|换几个|换一组/i.test(String(params.query || ""));
    const profileDerived = normalizeProfileDerived(params.profileDerived);

    if (changeBatch && !confirmed) {
      const offset = Math.max(Number(params.offset || 0), 0);
      const jobs = Array.isArray(params.existingJobs) ? params.existingJobs.slice(offset, offset + 5) : [];
      return {
        success: true,
        data: {
          createdScan: false,
          offset,
          returned: jobs.length,
          hasMore: Array.isArray(params.existingJobs) && params.existingJobs.length > offset + jobs.length,
        },
        errorCategory: "ok",
        llmSummary: jobs.length > 0
          ? "换一批已从当前岗位机会池返回下一组结果；不要创建新的 scan_queue。"
          : "用户想换一批时，应先读取当前 scan/opportunity pool 的下一批；没有可用机会前不要创建新的 scan_queue。",
        uiPayload: {
          type: "job_discovery_batch",
          jobs,
          offset,
          nextOffset: offset + jobs.length,
          source: "current_opportunity_pool",
        },
        rawData: { createdScan: false, criteria, offset, jobs },
      };
    }

    if (!confirmed) {
      return {
        success: true,
        data: { needsConfirmation: true, criteria },
        errorCategory: "ok",
        llmSummary: "岗位发现需要用户先确认条件；不要创建 scan_queue，也不要声称已经开始扫描。",
        uiPayload: {
          type: "job_discovery_confirmation",
          criteria,
          profileDerived,
          primaryAction: { id: "start_job_discovery", label: "开始岗位发现" },
        },
        rawData: { criteria, createdScan: false, profileDerived },
      };
    }

    try {
      const createResponse = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const created = await createResponse.json().catch(() => ({}));
      const scanId = createResponse.status === 409 ? created.existingScanId : created.scanId;
      if (!createResponse.ok && createResponse.status !== 409) {
        throw new Error(created.message || created.error || "岗位发现扫描创建失败");
      }
      if (!scanId) throw new Error("岗位发现扫描创建后没有返回 scanId");

      const statusResponse = await fetch(`/api/scan/status?scanId=${encodeURIComponent(String(scanId))}`);
      const statusJson = await statusResponse.json().catch(() => ({}));
      const readBack = statusJson.data;
      if (!statusResponse.ok || !readBack?.scanId) throw new Error(statusJson.error || "岗位发现扫描读回失败");

      return {
        success: true,
        data: {
          scanId,
          conflict: createResponse.status === 409,
          readBack,
          readBackVerified: true,
        },
        errorCategory: "ok",
        llmSummary: createResponse.status === 409
          ? `已恢复正在进行的岗位发现任务 ${scanId}，当前状态 ${readBack.status}。`
          : `已开始岗位发现任务 ${scanId}，已读回状态 ${readBack.status}，公司数 ${readBack.companiesTotal}。`,
        uiPayload: {
          type: "job_discovery_run",
          scanId,
          status: readBack.status,
          companiesDone: readBack.companiesDone,
          companiesTotal: readBack.companiesTotal,
          jobsFound: readBack.jobsFound,
          jobsNew: readBack.jobsNew,
          criteria,
          recoveredExistingScan: createResponse.status === 409,
          readBackVerified: true,
          readBackEvidence: {
            scanId: readBack.scanId,
            status: readBack.status,
            createdAt: readBack.createdAt,
          },
        },
        rawData: { scanId, criteria, readBack, readBackVerified: true },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "岗位发现扫描创建失败";
      return {
        success: false,
        data: { error: message, criteria },
        error: message,
        errorCategory: "transient",
        recoverable: true,
        retryHint: "稍后重试岗位发现扫描创建。",
        llmSummary: `岗位发现未开始：${message}`,
        uiPayload: {
          type: "job_discovery_error",
          error: message,
          criteria,
        },
        rawData: { error: message, criteria },
      };
    }
  },
  formatResult(result: ToolResult) {
    return result.llmSummary || JSON.stringify(result.data).slice(0, 500);
  },
};

function normalizeJobDiscoveryCriteria(input: JobDiscoveryRunInput) {
  const titlePositive = normalizeKeywordList(input.titleKeywords)
    .concat(normalizeKeywordList(input.titleKeyword))
    .concat(normalizeKeywordList(input.query));
  const titleNegative = normalizeKeywordList(input.excludeKeywords).concat(normalizeKeywordList(input.excludeKeyword));
  const location = (input.location || "").trim();
  const maxResults = clampMaxResults(input.maxResults);
  const companies = Array.isArray(input.companies)
    ? input.companies.map((company) => String(company).trim()).filter(Boolean)
    : undefined;

  return {
    companies,
    titlePositive: Array.from(new Set(titlePositive)),
    titleNegative: Array.from(new Set(titleNegative)),
    location,
    maxResults,
  };
}

function normalizeKeywordList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function clampMaxResults(value: unknown) {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.floor(parsed), 1), 200);
}

function normalizeProfileDerived(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { field: string; label?: string; value?: unknown } => typeof item === "object" && item !== null && "field" in item)
    .map((item) => ({
      field: String(item.field || ""),
      label: item.label ? String(item.label) : String(item.field || ""),
      value: item.value,
    }))
    .filter((item) => item.field);
}
