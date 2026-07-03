import { spawn } from "child_process";
import path from "path";
import { createScanEntryForUser, getScanStatusForUser } from "@/lib/scan-data";
import { loadPortals } from "../../lib/scan/orchestrator.mjs";

export interface JobDiscoveryRunInput {
  companies?: string[];
  titleKeywords?: string[] | string;
  titleKeyword?: string;
  excludeKeywords?: string[] | string;
  excludeKeyword?: string;
  query?: string;
  location?: string;
  maxResults?: number;
}

let workerStartedAt = 0;

export function normalizeJobDiscoveryCriteria(input: JobDiscoveryRunInput) {
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

export async function startJobDiscoveryRunForUser(userId: string, input: JobDiscoveryRunInput) {
  const criteria = normalizeJobDiscoveryCriteria(input);
  if (criteria.titlePositive.length === 0) {
    return {
      success: false as const,
      error: "missing_title_keywords",
      message: "请先确认岗位关键词，再开始岗位发现。",
      criteria,
    };
  }

  const companies = await loadPortals();
  const result = await createScanEntryForUser(
    userId,
    companies,
    criteria.companies,
    { positive: criteria.titlePositive, negative: criteria.titleNegative },
    { location: criteria.location, maxResults: criteria.maxResults },
  );

  if (!result.conflict) kickScanWorker();
  const readBack = await getScanStatusForUser(result.scanId, userId);
  if (!readBack) {
    return {
      success: false as const,
      error: "scan_read_back_failed",
      message: "岗位发现任务创建后未能读回校验，请稍后重试。",
      scanId: result.scanId,
      criteria,
    };
  }

  return {
    success: true as const,
    scanId: result.scanId,
    conflict: result.conflict,
    companiesTotal: result.companiesTotal ?? readBack.companiesTotal,
    criteria,
    readBack,
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

function kickScanWorker() {
  const now = Date.now();
  if (now - workerStartedAt < 3000) return;
  workerStartedAt = now;

  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), "scripts", "scan-worker.mjs"), "--once"],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: process.env,
    },
  );
  child.unref();
}
